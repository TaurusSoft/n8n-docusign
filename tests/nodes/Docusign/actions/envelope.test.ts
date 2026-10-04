import { describe, expect, it } from 'vitest';

import { envelopeOperationHandlers } from '../../../../nodes/Docusign/actions/envelope';
import envelopeFixture from '../../../fixtures/envelope.json';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

const ENVELOPE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('envelope: create', () => {
	it('posts an envelope built from binary documents', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'documents',
				emailSubject: 'Please sign',
				envelopeStatus: 'sent',
				binaryPropertyNames: 'data',
				signersUi: {
					signer: [{ name: 'Ada', email: 'ada@example.com', signaturePlacement: 'anchor' }],
				},
				additionalFields: {},
			},
			binary: { data: { buffer: Buffer.from('pdf'), meta: { fileName: 'contract.pdf' } } },
			responses: [envelopeFixture],
		});

		const items = await envelopeOperationHandlers.create(ctx, 0, testDocusignContext);

		const request = ctx.requests[0].options;
		expect(request.method).toBe('POST');
		expect(request.url).toBe(`${API_BASE_URL}/envelopes`);
		expect(request.body).toMatchObject({
			emailSubject: 'Please sign',
			status: 'sent',
			documents: [
				{
					documentId: '1',
					name: 'contract.pdf',
					fileExtension: 'pdf',
					documentBase64: Buffer.from('pdf').toString('base64'),
				},
			],
			recipients: {
				signers: [
					{
						email: 'ada@example.com',
						name: 'Ada',
						recipientId: '1',
						routingOrder: '1',
						tabs: {
							signHereTabs: [
								{
									anchorString: '/sig1/',
									anchorUnits: 'pixels',
									anchorXOffset: '0',
									anchorYOffset: '0',
								},
							],
						},
					},
				],
			},
		});
		expect(items[0].json).toEqual(envelopeFixture);
		expect(items[0].pairedItem).toEqual({ item: 0 });
	});

	it('posts an envelope built from a template', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'template',
				emailSubject: 'Sign the NDA',
				envelopeStatus: 'created',
				templateId: 'tpl-1',
				templateRolesUi: {
					role: [{ roleName: 'Signer 1', name: 'Ada', email: 'ada@example.com' }],
				},
				additionalFields: {},
			},
			responses: [envelopeFixture],
		});

		await envelopeOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toMatchObject({
			templateId: 'tpl-1',
			status: 'created',
			templateRoles: [
				{ roleName: 'Signer 1', name: 'Ada', email: 'ada@example.com', routingOrder: '1' },
			],
		});
	});

	it('passes a raw JSON definition through untouched', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'json',
				envelopeDefinitionJson: '{"emailSubject":"Raw","status":"sent","brandId":"b1"}',
			},
			responses: [envelopeFixture],
		});

		await envelopeOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			emailSubject: 'Raw',
			status: 'sent',
			brandId: 'b1',
		});
	});
});

describe('envelope: get', () => {
	it('gets an envelope by ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [envelopeFixture],
		});

		const items = await envelopeOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('GET');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}`);
		expect(items).toHaveLength(1);
	});

	it('joins the include option into a comma-separated query', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				options: { include: ['recipients', 'documents'] },
			},
			responses: [envelopeFixture],
		});

		await envelopeOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ include: 'recipients,documents' });
	});

	it('sends no query when nothing was selected', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: { include: [] } },
			responses: [envelopeFixture],
		});

		await envelopeOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toBeUndefined();
	});
});

describe('envelope: getAll', () => {
	const page = { envelopes: [{ envelopeId: '1' }], resultSetSize: 1, totalSetSize: 1 };

	it('defaults to a 30 day window, because Docusign needs a lower bound', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: true, filters: {}, options: {} },
			responses: [page],
		});

		await envelopeOperationHandlers.getAll(ctx, 0, testDocusignContext);

		const fromDate = new Date((ctx.requests[0].options.qs as { from_date: string }).from_date);
		const daysAgo = (Date.now() - fromDate.getTime()) / 86_400_000;

		expect(daysAgo).toBeGreaterThan(29);
		expect(daysAgo).toBeLessThan(31);
	});

	it('does not invent a window when envelope IDs are given', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: true, filters: { envelopeIds: 'a, b' }, options: {} },
			responses: [page],
		});

		await envelopeOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toMatchObject({ envelope_ids: 'a,b' });
		expect(ctx.requests[0].options.qs).not.toHaveProperty('from_date');
	});

	it('maps every filter onto its documented query parameter', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				returnAll: true,
				filters: {
					status: ['sent', 'completed'],
					fromDate: '2026-01-01T00:00:00.000Z',
					toDate: '2026-02-01T00:00:00.000Z',
					searchText: 'invoice',
					userEmail: 'ada@example.com',
				},
				options: { include: ['recipients'], orderBy: 'created' },
			},
			responses: [page],
		});

		await envelopeOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toMatchObject({
			status: 'sent,completed',
			from_date: '2026-01-01T00:00:00.000Z',
			to_date: '2026-02-01T00:00:00.000Z',
			search_text: 'invoice',
			email: 'ada@example.com',
			include: 'recipients',
			order_by: 'created',
		});
	});

	it('honours the limit when returnAll is off', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: false, limit: 2, filters: {}, options: {} },
			responses: [
				{
					envelopes: [{ envelopeId: '1' }, { envelopeId: '2' }, { envelopeId: '3' }],
					resultSetSize: 3,
					totalSetSize: 10,
				},
			],
		});

		const items = await envelopeOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items).toHaveLength(2);
	});

	it('returns one item per envelope', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: true, filters: {}, options: {} },
			responses: [
				{
					envelopes: [{ envelopeId: '1' }, { envelopeId: '2' }],
					resultSetSize: 2,
					totalSetSize: 2,
				},
			],
		});

		const items = await envelopeOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items.map((item) => item.json.envelopeId)).toEqual(['1', '2']);
	});
});

describe('envelope: send, void, resend', () => {
	it('sends a draft by setting the status', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{ envelopeId: ENVELOPE_ID }],
		});

		await envelopeOperationHandlers.send(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}`);
		expect(ctx.requests[0].options.body).toEqual({ status: 'sent' });
	});

	it('voids with the reason shown to recipients', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, voidReason: 'Superseded' },
			responses: [{ envelopeId: ENVELOPE_ID }],
		});

		await envelopeOperationHandlers.void(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			status: 'voided',
			voidedReason: 'Superseded',
		});
	});

	it('resends through the query flag and an explicit empty body', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{ envelopeId: ENVELOPE_ID }],
		});

		await envelopeOperationHandlers.resend(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ resend_envelope: true });
		expect(ctx.requests[0].options.body).toEqual({});
	});
});

describe('envelope: getFormData and getAuditEvents', () => {
	it('gets the form data', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{ formData: [] }],
		});

		await envelopeOperationHandlers.getFormData(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/form_data`);
	});

	it('flattens audit events into one item each', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{ auditEvents: [{ eventFields: [] }, { eventFields: [] }] }],
		});

		const items = await envelopeOperationHandlers.getAuditEvents(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(
			`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/audit_events`,
		);
		expect(items).toHaveLength(2);
	});

	it('returns nothing when there are no audit events', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{}],
		});

		const items = await envelopeOperationHandlers.getAuditEvents(ctx, 0, testDocusignContext);

		expect(items).toEqual([]);
	});
});
