import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { Docusign } from '../../../nodes/Docusign/Docusign.node';
import userInfoFixture from '../../fixtures/userinfo.json';
import {
	createExecuteFunctions,
	createLoadOptionsFunctions,
	type MockContextOptions,
} from '../../helpers/mockContexts';
import { ACCOUNT_ID, API_BASE_URL } from '../../helpers/msw';

const node = new Docusign();

function run(options: MockContextOptions) {
	const ctx = createExecuteFunctions(options);

	return { ctx, result: node.execute.call(ctx as unknown as IExecuteFunctions) };
}

const getEnvelopeParameters = {
	authentication: 'oAuth2',
	resource: 'envelope',
	operation: 'get',
	envelopeId: 'env-1',
	options: {},
};

describe('Docusign.execute routing', () => {
	it('dispatches to the handler for the selected resource and operation', async () => {
		const { ctx, result } = run({
			parameters: getEnvelopeParameters,
			responses: [{ envelopeId: 'env-1' }],
		});

		const output = await result;

		expect(output).toHaveLength(1);
		expect(output[0][0].json).toEqual({ envelopeId: 'env-1' });
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/env-1`);
	});

	it('rejects a resource and operation combination that has no handler', async () => {
		const { result } = run({
			parameters: { ...getEnvelopeParameters, operation: 'explode' },
		});

		await expect(result).rejects.toThrow(
			/operation "explode" is not supported for resource "envelope"/,
		);
	});

	it('rejects an unknown resource', async () => {
		const { result } = run({
			parameters: { ...getEnvelopeParameters, resource: 'unicorn', operation: 'get' },
		});

		await expect(result).rejects.toThrow(/is not supported for resource "unicorn"/);
	});

	it('explains an unusable authentication selection', async () => {
		const { result } = run({
			parameters: { ...getEnvelopeParameters, authentication: 'basic' },
		});

		await expect(result).rejects.toThrow(/Unknown Docusign authentication method/);
	});

	it('uses the JWT credential when JWT is selected', async () => {
		const { ctx, result } = run({
			parameters: { ...getEnvelopeParameters, authentication: 'jwt' },
			responses: [{ envelopeId: 'env-1' }],
		});

		await result;

		expect(ctx.requests[0].credentialType).toBe('docusignJwtApi');
	});

	it('produces identical requests for both authentication methods', async () => {
		const oauth = run({
			parameters: getEnvelopeParameters,
			responses: [{ envelopeId: 'env-1' }],
		});
		const jwt = run({
			parameters: { ...getEnvelopeParameters, authentication: 'jwt' },
			responses: [{ envelopeId: 'env-1' }],
		});

		await Promise.all([oauth.result, jwt.result]);

		expect(oauth.ctx.requests[0].options).toEqual(jwt.ctx.requests[0].options);
	});
});

describe('Docusign.execute item handling', () => {
	it('processes every input item and keeps the paired item link', async () => {
		const { result } = run({
			parameters: {
				...getEnvelopeParameters,
				envelopeId: (itemIndex: number) => `env-${itemIndex}`,
			},
			items: [{ json: {} }, { json: {} }, { json: {} }],
			responses: [{ id: 0 }, { id: 1 }, { id: 2 }],
		});

		const output = await result;

		expect(output[0]).toHaveLength(3);
		expect(output[0].map((item) => item.pairedItem)).toEqual([
			{ item: 0 },
			{ item: 1 },
			{ item: 2 },
		]);
	});

	it('resolves the account once even across many items', async () => {
		const { ctx, result } = run({
			parameters: getEnvelopeParameters,
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			items: [{ json: {} }, { json: {} }],
			responses: [userInfoFixture, { id: 1 }, { id: 2 }],
		});

		await result;

		const userInfoCalls = ctx.requests.filter((request) =>
			request.options.url.endsWith('/oauth/userinfo'),
		);

		expect(userInfoCalls).toHaveLength(1);
		expect(ctx.requests).toHaveLength(3);
	});

	it('flattens a multi-item result into a single output branch', async () => {
		const { result } = run({
			parameters: {
				authentication: 'oAuth2',
				resource: 'envelope',
				operation: 'getAuditEvents',
				envelopeId: 'env-1',
			},
			responses: [{ auditEvents: [{ a: 1 }, { a: 2 }] }],
		});

		const output = await result;

		expect(output[0]).toHaveLength(2);
	});

	it('returns an empty branch for an empty input', async () => {
		const { result } = run({ parameters: getEnvelopeParameters, items: [] });

		expect(await result).toEqual([[]]);
	});
});

describe('Docusign.execute error handling', () => {
	const failing = () =>
		Object.assign(new Error('Request failed'), {
			response: {
				status: 404,
				body: { errorCode: 'ENVELOPE_DOES_NOT_EXIST', message: 'Envelope not found.' },
			},
		});

	it('throws a NodeApiError carrying the Docusign error code', async () => {
		const { result } = run({
			parameters: getEnvelopeParameters,
			responses: [failing()],
		});

		await expect(result).rejects.toThrow(/ENVELOPE_DOES_NOT_EXIST/);
	});

	it('collects errors per item when continueOnFail is on', async () => {
		const { result } = run({
			parameters: getEnvelopeParameters,
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			responses: [failing(), { envelopeId: 'ok' }],
		});

		const output = await result;

		expect(output[0]).toHaveLength(2);
		expect(output[0][0].json.error).toMatch(/ENVELOPE_DOES_NOT_EXIST/);
		expect(output[0][0].pairedItem).toEqual({ item: 0 });
		expect(output[0][1].json).toEqual({ envelopeId: 'ok' });
	});

	it('keeps going after a failing item rather than aborting the run', async () => {
		const { result } = run({
			parameters: getEnvelopeParameters,
			items: [{ json: {} }, { json: {} }, { json: {} }],
			continueOnFail: true,
			responses: [failing(), failing(), { envelopeId: 'ok' }],
		});

		const output = await result;

		expect(output[0]).toHaveLength(3);
		expect(output[0][2].json).toEqual({ envelopeId: 'ok' });
	});
});

describe('Docusign loadOptions', () => {
	const loadOptions = (options: MockContextOptions) => {
		const ctx = createLoadOptionsFunctions({
			parameters: { authentication: 'oAuth2', ...(options.parameters ?? {}) },
			...options,
		});

		return { ctx, ctxTyped: ctx as unknown as ILoadOptionsFunctions };
	};

	it('lists templates sorted by name', async () => {
		const { ctx, ctxTyped } = loadOptions({
			parameters: {},
			responses: [
				{
					envelopeTemplates: [
						{ templateId: 'b', name: 'Zeta' },
						{ templateId: 'a', name: 'Alpha' },
					],
					resultSetSize: 2,
					totalSetSize: 2,
				},
			],
		});

		const result = await node.methods.loadOptions.getTemplates.call(ctxTyped);

		expect(result).toEqual([
			{ name: 'Alpha', value: 'a' },
			{ name: 'Zeta', value: 'b' },
		]);
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/templates`);
	});

	it('falls back to the template ID when a template has no name', async () => {
		const { ctxTyped } = loadOptions({
			parameters: {},
			responses: [
				{ envelopeTemplates: [{ templateId: 'only' }], resultSetSize: 1, totalSetSize: 1 },
			],
		});

		expect(await node.methods.loadOptions.getTemplates.call(ctxTyped)).toEqual([
			{ name: 'only', value: 'only' },
		]);
	});

	it('drops entries without an ID, which would break the dropdown', async () => {
		const { ctxTyped } = loadOptions({
			parameters: {},
			responses: [
				{
					envelopeTemplates: [{ name: 'Broken' }, { templateId: 'ok', name: 'Fine' }],
					resultSetSize: 2,
					totalSetSize: 2,
				},
			],
		});

		expect(await node.methods.loadOptions.getTemplates.call(ctxTyped)).toEqual([
			{ name: 'Fine', value: 'ok' },
		]);
	});

	it('lists folders sorted by name', async () => {
		const { ctx, ctxTyped } = loadOptions({
			parameters: {},
			responses: [
				{
					folders: [
						{ folderId: '2', name: 'Sent' },
						{ folderId: '1', name: 'Drafts' },
					],
				},
			],
		});

		const result = await node.methods.loadOptions.getFolders.call(ctxTyped);

		expect(result).toEqual([
			{ name: 'Drafts', value: '1' },
			{ name: 'Sent', value: '2' },
		]);
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/folders`);
	});

	it('returns an empty folder list without failing', async () => {
		const { ctxTyped } = loadOptions({ parameters: {}, responses: [{}] });

		expect(await node.methods.loadOptions.getFolders.call(ctxTyped)).toEqual([]);
	});

	it('labels users with their name and email', async () => {
		const { ctxTyped } = loadOptions({
			parameters: {},
			responses: [
				{
					users: [{ userId: 'u1', userName: 'Ada', email: 'ada@example.com' }],
					resultSetSize: 1,
					totalSetSize: 1,
				},
			],
		});

		expect(await node.methods.loadOptions.getUsers.call(ctxTyped)).toEqual([
			{ name: 'Ada (ada@example.com)', value: 'u1' },
		]);
	});

	it('uses the JWT credential for load options when selected', async () => {
		const { ctx, ctxTyped } = loadOptions({
			parameters: { authentication: 'jwt' },
			responses: [{ folders: [] }],
		});

		await node.methods.loadOptions.getFolders.call(ctxTyped);

		expect(ctx.requests[0].credentialType).toBe('docusignJwtApi');
	});

	it('resolves the account through userinfo when the credential has no overrides', async () => {
		const { ctx, ctxTyped } = loadOptions({
			parameters: {},
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			responses: [userInfoFixture, { folders: [] }],
		});

		await node.methods.loadOptions.getFolders.call(ctxTyped);

		expect(ctx.requests[1].options.url).toContain(ACCOUNT_ID);
	});
});
