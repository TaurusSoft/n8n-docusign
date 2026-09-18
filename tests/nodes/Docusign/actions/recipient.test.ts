import { describe, expect, it } from 'vitest';

import { recipientOperationHandlers } from '../../../../nodes/Docusign/actions/recipient';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

const ENVELOPE_ID = 'env-1';
const RECIPIENTS_URL = `${API_BASE_URL}/envelopes/${ENVELOPE_ID}/recipients`;

describe('recipient: getAll', () => {
	it('merges every recipient type into a single list', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [
				{
					signers: [{ recipientId: '1' }],
					inPersonSigners: [{ recipientId: '2' }],
					carbonCopies: [{ recipientId: '3' }],
					certifiedDeliveries: [{ recipientId: '4' }],
				},
			],
		});

		const items = await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items.map((item) => item.json.recipientId)).toEqual(['1', '2', '3', '4']);
	});

	it('falls back to the raw payload when no recipient arrays are present', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [{ recipientCount: '0' }],
		});

		const items = await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ recipientCount: '0' });
	});

	it('forwards the include options', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				options: { includeTabs: true, includeAnchorTabLocations: true },
			},
			responses: [{ signers: [] }],
		});

		await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({
			include_tabs: true,
			include_anchor_tab_locations: true,
		});
	});
});

describe('recipient: add', () => {
	it('posts the signers built from the collection', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'Ada', email: 'ada@example.com' }] },
				options: {},
			},
			responses: [{ recipientUpdateResults: [] }],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.url).toBe(RECIPIENTS_URL);
		expect(ctx.requests[0].options.body).toMatchObject({
			signers: [{ name: 'Ada', email: 'ada@example.com', recipientId: '1' }],
		});
	});

	it('adds the resend flag only when requested', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'A', email: 'a@e.com' }] },
				options: { resendEnvelope: true },
			},
			responses: [{}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ resend_envelope: true });
	});

	it('sends an empty signer list rather than failing when none were configured', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, signersUi: {}, options: {} },
			responses: [{}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({ signers: [] });
	});
});

describe('recipient: update', () => {
	it('sends only the changed fields alongside the recipient ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '1',
				updateFields: { email: 'new@example.com', routingOrder: 2 },
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.body).toEqual({
			signers: [{ recipientId: '1', email: 'new@example.com', routingOrder: '2' }],
		});
	});

	it('includes the name and note when given', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '1',
				updateFields: { name: 'Ada L.', note: 'Please check clause 4' },
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			signers: [{ recipientId: '1', name: 'Ada L.', note: 'Please check clause 4' }],
		});
	});

	it('ignores empty strings so nothing is overwritten by accident', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '1',
				updateFields: { name: '', email: '', note: '' },
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({ signers: [{ recipientId: '1' }] });
	});
});

describe('recipient: delete', () => {
	it('deletes a single recipient by ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, recipientId: '2' },
			responses: [{}],
		});

		await recipientOperationHandlers.delete(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('DELETE');
		expect(ctx.requests[0].options.url).toBe(`${RECIPIENTS_URL}/2`);
	});
});
