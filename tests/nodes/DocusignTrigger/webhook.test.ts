import { createHmac } from 'crypto';
import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IHookFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { DocusignTrigger } from '../../../nodes/DocusignTrigger/DocusignTrigger.node';
import connectPayload from '../../fixtures/connect-envelope-completed.json';
import {
	createHookFunctions,
	createWebhookFunctions,
	type MockContextOptions,
} from '../../helpers/mockContexts';
import { API_BASE_URL } from '../../helpers/msw';

const node = new DocusignTrigger();
const SECRET = 'test-secret';
const WEBHOOK_URL = 'https://n8n.example.com/webhook/docusign';

function rawBodyFor(payload: unknown = connectPayload): Buffer {
	return Buffer.from(JSON.stringify(payload), 'utf8');
}

function signatureHeaders(rawBody: Buffer, secret = SECRET) {
	return {
		'x-docusign-signature-1': createHmac('sha256', secret).update(rawBody).digest('base64'),
	};
}

const defaultParameters = {
	configurationMode: 'manual',
	events: ['envelope-completed'],
	verifyHmac: true,
	authentication: 'none',
	downloadDocuments: false,
	options: {},
};

function webhookCtx(overrides: MockContextOptions = {}) {
	const rawBody = (overrides.rawBody as Buffer | undefined) ?? rawBodyFor();

	return createWebhookFunctions({
		webhookUrl: WEBHOOK_URL,
		...overrides,
		// Merged last so a partial override does not drop the defaults.
		parameters: { ...defaultParameters, ...(overrides.parameters ?? {}) },
		body: overrides.body ?? connectPayload,
		rawBody,
		headers: overrides.headers ?? signatureHeaders(rawBody),
	});
}

describe('DocusignTrigger description', () => {
	it('declares a POST webhook that keeps the raw body for HMAC verification', () => {
		expect(node.description.webhooks).toEqual([
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
				rawBody: true,
			},
		]);
	});

	it('is a trigger with no inputs', () => {
		expect(node.description.group).toEqual(['trigger']);
		expect(node.description.inputs).toEqual([]);
		expect(node.description.subtitle).toBeTruthy();
	});

	it('verifies HMAC by default', () => {
		const property = node.description.properties.find((entry) => entry.name === 'verifyHmac');

		expect(property?.default).toBe(true);
	});

	it('defaults to the manual configuration mode', () => {
		const property = node.description.properties.find(
			(entry) => entry.name === 'configurationMode',
		);

		expect(property?.default).toBe('manual');
	});

	it('defaults to no API credential, so manual mode needs no OAuth setup', () => {
		const property = node.description.properties.find((entry) => entry.name === 'authentication');

		expect(property?.default).toBe('none');
	});

	it('requires the HMAC credential only while verification is on', () => {
		const credential = node.description.credentials?.find(
			(entry) => entry.name === 'docusignConnectApi',
		);

		expect(credential?.displayOptions?.show?.verifyHmac).toEqual([true]);
		expect(credential?.testedBy).toBe('docusignConnectApiTest');
	});

	it('only offers events Docusign Connect actually emits', () => {
		const property = node.description.properties.find((entry) => entry.name === 'events');
		const values = (property?.options as Array<{ value: string }>).map((option) => option.value);

		expect(values.every((value) => /^(envelope|recipient)-[a-z]+$/.test(value))).toBe(true);
		expect(values).toContain('envelope-completed');
	});
});

describe('DocusignTrigger.webhook HMAC verification', () => {
	it('starts the workflow for a correctly signed request', async () => {
		const ctx = webhookCtx();

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json).toMatchObject({ event: 'envelope-completed' });
	});

	it('answers 401 and starts nothing when the signature does not match', async () => {
		const rawBody = rawBodyFor();
		const ctx = webhookCtx({ rawBody, headers: signatureHeaders(rawBody, 'wrong-secret') });

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData).toBeUndefined();
		// n8n answers 200 for a webhookResponse, so the status has to be written
		// onto the response itself for Docusign to log the failed delivery.
		expect(ctx.sentResponse.statusCode).toBe(401);
		expect(ctx.sentResponse.body).toEqual({ status: 'unauthorized' });
		expect(result.noWebhookResponse).toBe(true);
	});

	it('rejects a request without any signature header', async () => {
		const ctx = webhookCtx({ headers: {} });

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData).toBeUndefined();
		expect(ctx.sentResponse.statusCode).toBe(401);
	});

	it('leaves the response untouched for a signature that matches', async () => {
		const ctx = webhookCtx();

		await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(ctx.sentResponse.statusCode).toBeUndefined();
	});

	it('accepts when one of several signature headers matches', async () => {
		const rawBody = rawBodyFor();
		const ctx = webhookCtx({
			rawBody,
			headers: {
				'x-docusign-signature-1': 'stale',
				'x-docusign-signature-2': signatureHeaders(rawBody)['x-docusign-signature-1'],
			},
		});

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData).toBeDefined();
	});

	it('fails loudly when the credential holds no secret', async () => {
		const ctx = webhookCtx({ credentials: { docusignConnectApi: { hmacSecret: '  ' } } });

		await expect(node.webhook.call(ctx as unknown as IWebhookFunctions)).rejects.toThrow(
			/contains no secret/,
		);
	});

	it('fails loudly when the raw body is unavailable', async () => {
		const ctx = createWebhookFunctions({
			parameters: defaultParameters,
			body: connectPayload,
			rawBody: null as unknown as Buffer,
			headers: signatureHeaders(rawBodyFor()),
		});

		await expect(node.webhook.call(ctx as unknown as IWebhookFunctions)).rejects.toThrow(
			/raw request body is not available/,
		);
	});

	it('skips verification entirely when switched off', async () => {
		const ctx = webhookCtx({
			parameters: { verifyHmac: false },
			headers: {},
		});

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData).toBeDefined();
		expect(ctx.getCredentials).not.toHaveBeenCalled();
	});
});

describe('DocusignTrigger.webhook event filtering', () => {
	it('acknowledges but ignores an event that was not selected', async () => {
		const payload = { ...connectPayload, event: 'envelope-voided' };
		const rawBody = rawBodyFor(payload);
		const ctx = webhookCtx({ body: payload, rawBody, headers: signatureHeaders(rawBody) });

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result).toEqual({ workflowData: undefined });
	});

	it('accepts every event when no filter was set', async () => {
		const payload = { ...connectPayload, event: 'recipient-declined' };
		const rawBody = rawBodyFor(payload);
		const ctx = webhookCtx({
			parameters: { events: [] },
			body: payload,
			rawBody,
			headers: signatureHeaders(rawBody),
		});

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData).toBeDefined();
	});
});

describe('DocusignTrigger.webhook output', () => {
	it('emits the parsed payload as the item JSON', async () => {
		const ctx = webhookCtx();

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json).toEqual(connectPayload);
	});

	it('adds the raw body when the option is enabled', async () => {
		const rawBody = rawBodyFor();
		const ctx = webhookCtx({
			parameters: { options: { includeRawBody: true } },
			rawBody,
			headers: signatureHeaders(rawBody),
		});

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json.rawBody).toBe(rawBody.toString('utf8'));
	});

	it('downloads the combined PDF into a binary field when asked', async () => {
		const pdf = Buffer.from('%PDF signed');
		const rawBody = rawBodyFor();
		const ctx = webhookCtx({
			parameters: {
				downloadDocuments: true,
				authentication: 'oAuth2',
				options: { binaryPropertyName: 'document' },
			},
			rawBody,
			headers: signatureHeaders(rawBody),
			responses: [{ body: pdf, headers: { 'content-type': 'application/pdf' } }],
		});

		const result = await node.webhook.call(ctx as unknown as IWebhookFunctions);
		const item = result.workflowData?.[0][0];

		expect(ctx.requests[0].options.url).toBe(
			`${API_BASE_URL}/envelopes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/documents/combined`,
		);
		expect(Buffer.from(item?.binary?.document.data ?? '', 'base64').equals(pdf)).toBe(true);
		expect(item?.json).toMatchObject({ event: 'envelope-completed' });
	});

	it('explains that no credential is configured for the download', async () => {
		const rawBody = rawBodyFor();
		const ctx = webhookCtx({
			parameters: { downloadDocuments: true, authentication: 'none' },
			rawBody,
			headers: signatureHeaders(rawBody),
		});

		await expect(node.webhook.call(ctx as unknown as IWebhookFunctions)).rejects.toThrow(
			/Pick either OAuth2 or JWT/,
		);
	});

	it('fails clearly when the payload carries no envelope ID to download', async () => {
		const payload = { event: 'envelope-completed', data: {} };
		const rawBody = rawBodyFor(payload);
		const ctx = webhookCtx({
			parameters: { downloadDocuments: true, authentication: 'oAuth2' },
			body: payload,
			rawBody,
			headers: signatureHeaders(rawBody),
		});

		await expect(node.webhook.call(ctx as unknown as IWebhookFunctions)).rejects.toThrow(
			/contains no envelope ID/,
		);
	});
});

describe('DocusignTrigger webhook lifecycle in manual mode', () => {
	const manualCtx = () => createHookFunctions({ parameters: defaultParameters });

	it('reports the webhook as present, because nothing is registered through n8n', async () => {
		const ctx = manualCtx();

		await expect(
			node.webhookMethods.default.checkExists.call(ctx as unknown as IHookFunctions),
		).resolves.toBe(true);
		expect(ctx.requests).toHaveLength(0);
	});

	it('creates nothing and calls no API', async () => {
		const ctx = manualCtx();

		await expect(
			node.webhookMethods.default.create.call(ctx as unknown as IHookFunctions),
		).resolves.toBe(true);
		expect(ctx.requests).toHaveLength(0);
	});

	it('deletes nothing and calls no API', async () => {
		const ctx = manualCtx();

		await expect(
			node.webhookMethods.default.delete.call(ctx as unknown as IHookFunctions),
		).resolves.toBe(true);
		expect(ctx.requests).toHaveLength(0);
	});
});

describe('DocusignTrigger webhook lifecycle in automatic mode', () => {
	const automaticParameters = {
		...defaultParameters,
		configurationMode: 'automatic',
		authentication: 'oAuth2',
	};

	const autoCtx = (overrides: MockContextOptions = {}) =>
		createHookFunctions({
			webhookUrl: WEBHOOK_URL,
			workflowName: 'Contract flow',
			...overrides,
			parameters: { ...automaticParameters, ...(overrides.parameters ?? {}) },
		});

	it('finds an existing configuration for this webhook URL', async () => {
		const ctx = autoCtx({
			responses: [{ configurations: [{ connectId: '7', urlToPublishTo: WEBHOOK_URL }] }],
		});

		const exists = await node.webhookMethods.default.checkExists.call(
			ctx as unknown as IHookFunctions,
		);

		expect(exists).toBe(true);
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/connect`);
		expect(ctx.staticData.docusignConnectIds).toEqual(['7']);
	});

	it('reports no configuration when none points at this URL', async () => {
		const ctx = autoCtx({
			responses: [{ configurations: [{ connectId: '7', urlToPublishTo: 'https://other.test' }] }],
		});

		await expect(
			node.webhookMethods.default.checkExists.call(ctx as unknown as IHookFunctions),
		).resolves.toBe(false);
	});

	it('creates a configuration named after the workflow and stores its ID', async () => {
		const ctx = autoCtx({ responses: [{ connectId: '42' }] });

		const created = await node.webhookMethods.default.create.call(
			ctx as unknown as IHookFunctions,
		);

		expect(created).toBe(true);
		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.body).toMatchObject({
			configurationType: 'custom',
			name: 'n8n - Contract flow',
			urlToPublishTo: WEBHOOK_URL,
			events: ['envelope-completed'],
		});
		expect(ctx.staticData.docusignConnectIds).toEqual(['42']);
	});

	it('uses a custom configuration name when given', async () => {
		const ctx = autoCtx({
			parameters: { options: { configurationName: 'My Connect' } },
			responses: [{ connectId: '1' }],
		});

		await node.webhookMethods.default.create.call(ctx as unknown as IHookFunctions);

		expect(ctx.requests[0].options.body).toMatchObject({ name: 'My Connect' });
	});

	it('creates two configurations when envelope and recipient events are mixed', async () => {
		const ctx = autoCtx({
			parameters: { events: ['envelope-completed', 'recipient-completed'] },
			responses: [{ connectId: '1' }, { connectId: '2' }],
		});

		await node.webhookMethods.default.create.call(ctx as unknown as IHookFunctions);

		expect(ctx.requests).toHaveLength(2);
		expect(ctx.staticData.docusignConnectIds).toEqual(['1', '2']);
	});

	it('refuses to activate without any selected event', async () => {
		const ctx = autoCtx({ parameters: { events: [] } });

		await expect(
			node.webhookMethods.default.create.call(ctx as unknown as IHookFunctions),
		).rejects.toThrow(/Select at least one event/);
	});

	it('deletes every stored configuration and clears the static data', async () => {
		const ctx = autoCtx({
			staticData: { docusignConnectIds: ['1', '2'] },
			responses: [{}, {}],
		});

		const deleted = await node.webhookMethods.default.delete.call(
			ctx as unknown as IHookFunctions,
		);

		expect(deleted).toBe(true);
		expect(ctx.requests.map((request) => request.options.url)).toEqual([
			`${API_BASE_URL}/connect/1`,
			`${API_BASE_URL}/connect/2`,
		]);
		expect(ctx.staticData.docusignConnectIds).toBeUndefined();
	});

	it('tolerates a configuration that was already removed in Docusign', async () => {
		const ctx = autoCtx({
			staticData: { docusignConnectIds: ['1'] },
			responses: [new Error('404')],
		});

		const deleted = await node.webhookMethods.default.delete.call(
			ctx as unknown as IHookFunctions,
		);

		expect(deleted).toBe(false);
		expect(ctx.staticData.docusignConnectIds).toBeUndefined();
	});

	it('does nothing on delete when no configuration was ever stored', async () => {
		const ctx = autoCtx({ staticData: {} });

		await expect(
			node.webhookMethods.default.delete.call(ctx as unknown as IHookFunctions),
		).resolves.toBe(true);
		expect(ctx.requests).toHaveLength(0);
	});

	it('requires an API credential', async () => {
		const ctx = autoCtx({ parameters: { authentication: 'none' } });

		await expect(
			node.webhookMethods.default.checkExists.call(ctx as unknown as IHookFunctions),
		).rejects.toThrow(/Pick either OAuth2 or JWT/);
	});
});

describe('DocusignTrigger credential test', () => {
	const runTest = (hmacSecret: unknown) =>
		node.methods.credentialTest.docusignConnectApiTest.call(
			{} as unknown as ICredentialTestFunctions,
			{ data: { hmacSecret } } as unknown as ICredentialsDecrypted,
		);

	it('accepts a plausible secret and says how to confirm it for real', async () => {
		const result = await runTest('a-long-enough-secret');

		expect(result.status).toBe('OK');
		expect(result.message).toMatch(/send a test event/);
	});

	it('rejects an empty secret', async () => {
		expect((await runTest('   ')).status).toBe('Error');
	});

	it('rejects a suspiciously short secret', async () => {
		const result = await runTest('short');

		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/too short/);
	});

	it('rejects a missing secret', async () => {
		expect((await runTest(undefined)).status).toBe('Error');
	});
});
