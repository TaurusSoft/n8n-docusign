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

	it('includes the roles beyond signers and copies, which a mixed envelope can hold', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [
				{
					signers: [{ recipientId: '1' }],
					agents: [{ recipientId: '2' }],
					editors: [{ recipientId: '3' }],
					witnesses: [{ recipientId: '4' }],
					intermediaries: [{ recipientId: '5' }],
				},
			],
		});

		const items = await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items.map((item) => item.json.recipientId).sort()).toEqual(['1', '2', '3', '4', '5']);
	});

	it('labels each recipient with its role so it can be fed back into Update', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [{ signers: [{ recipientId: '1' }], carbonCopies: [{ recipientId: '2' }] }],
		});

		const items = await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items.map((item) => item.json.recipientType)).toEqual(['signer', 'carbonCopy']);
	});

	it('returns no items for an envelope whose recipient lists are empty', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [{ signers: [], carbonCopies: [], recipientCount: '0' }],
		});

		const items = await recipientOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items).toEqual([]);
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
			responses: [{ signers: [] }, { recipientUpdateResults: [] }],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[1].options.method).toBe('POST');
		expect(ctx.requests[1].options.url).toBe(RECIPIENTS_URL);
		expect(ctx.requests[1].options.body).toMatchObject({
			signers: [{ name: 'Ada', email: 'ada@example.com', recipientId: '1' }],
		});
	});

	it('numbers new recipients above the IDs the envelope already uses', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: {
					signer: [
						{ name: 'Ada', email: 'ada@example.com' },
						{ name: 'Linus', email: 'linus@example.com' },
					],
				},
				options: {},
			},
			responses: [
				{
					signers: [{ recipientId: '1' }, { recipientId: '4' }],
					carbonCopies: [{ recipientId: '7' }],
				},
				{},
			],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('GET');
		expect(ctx.requests[1].options.body).toMatchObject({
			signers: [{ recipientId: '8' }, { recipientId: '9' }],
		});
	});

	it('starts at 1 on an envelope that has no recipients yet', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'Ada', email: 'ada@example.com' }] },
				options: {},
			},
			responses: [{ recipientCount: '0' }, {}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[1].options.body).toMatchObject({ signers: [{ recipientId: '1' }] });
	});

	it('ignores recipient IDs that are not numbers when looking for a free one', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'Ada', email: 'ada@example.com' }] },
				options: {},
			},
			responses: [{ signers: [{ recipientId: 'abc' }, { recipientId: '2' }] }, {}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[1].options.body).toMatchObject({ signers: [{ recipientId: '3' }] });
	});

	it('skips the lookup when the first recipient ID is pinned', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'Ada', email: 'ada@example.com' }] },
				options: { startRecipientId: 5 },
			},
			responses: [{}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests).toHaveLength(1);
		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.body).toMatchObject({ signers: [{ recipientId: '5' }] });
	});

	it('skips the lookup when every recipient carries its own ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: {
					signer: [{ name: 'Ada', email: 'ada@example.com', recipientId: '42' }],
				},
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests).toHaveLength(1);
		expect(ctx.requests[0].options.body).toMatchObject({ signers: [{ recipientId: '42' }] });
	});

	it('adds the resend flag only when requested', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				signersUi: { signer: [{ name: 'A', email: 'a@e.com' }] },
				options: { resendEnvelope: true },
			},
			responses: [{ signers: [] }, {}],
		});

		await recipientOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[1].options.qs).toEqual({ resend_envelope: true });
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

	it('writes to the group the recipient type names, not always to the signers', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '3',
				recipientType: 'carbonCopy',
				updateFields: { email: 'watcher@example.com' },
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			carbonCopies: [{ recipientId: '3', email: 'watcher@example.com' }],
		});
	});

	it.each([
		['certifiedDelivery', 'certifiedDeliveries'],
		['inPersonSigner', 'inPersonSigners'],
		['agent', 'agents'],
		['witness', 'witnesses'],
	])('addresses a %s through %s', async (recipientType, collection) => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '7',
				recipientType,
				updateFields: {},
				options: {},
			},
			responses: [{}],
		});

		await recipientOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({ [collection]: [{ recipientId: '7' }] });
	});

	it('rejects an unknown recipient type instead of updating a signer', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				recipientId: '1',
				recipientType: 'carbonCopies',
				updateFields: { email: 'new@example.com' },
				options: {},
			},
			responses: [{}],
		});

		await expect(recipientOperationHandlers.update(ctx, 0, testDocusignContext)).rejects.toThrow(
			/Unknown recipient type "carbonCopies"/,
		);
		expect(ctx.requests).toEqual([]);
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
