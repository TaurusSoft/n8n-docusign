import { describe, expect, it } from 'vitest';

import { customFieldOperationHandlers } from '../../../../nodes/Docusign/actions/customField';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

const ENVELOPE_ID = 'env-1';
const CUSTOM_FIELDS_URL = `${API_BASE_URL}/envelopes/${ENVELOPE_ID}/custom_fields`;

describe('customField: getAll', () => {
	it('merges both field types and tags each with its type', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [
				{
					textCustomFields: [{ fieldId: '1', name: 'Cost Centre' }],
					listCustomFields: [{ fieldId: '2', name: 'Region' }],
				},
			],
		});

		const items = await customFieldOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(CUSTOM_FIELDS_URL);
		expect(items.map((item) => [item.json.fieldId, item.json.fieldType])).toEqual([
			['1', 'text'],
			['2', 'list'],
		]);
	});

	it('falls back to the raw payload when there are no fields', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID },
			responses: [{ someOtherKey: true }],
		});

		const items = await customFieldOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ someOtherKey: true });
	});
});

describe('customField: create', () => {
	it('puts a text field into textCustomFields', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'text',
				fieldName: 'Cost Centre',
				fieldValue: 'CC-42',
				options: {},
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.body).toEqual({
			textCustomFields: [{ name: 'Cost Centre', value: 'CC-42' }],
		});
	});

	it('puts a list field into listCustomFields with its items', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'list',
				fieldName: 'Region',
				fieldValue: 'EU',
				options: { listItems: 'EU, US, APAC' },
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			listCustomFields: [{ name: 'Region', value: 'EU', listItems: ['EU', 'US', 'APAC'] }],
		});
	});

	it('stringifies the required and show flags', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'text',
				fieldName: 'N',
				fieldValue: 'V',
				options: { required: true, show: false },
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			textCustomFields: [{ name: 'N', value: 'V', required: 'true', show: 'false' }],
		});
	});

	it('ignores list items for a text field', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'text',
				fieldName: 'N',
				fieldValue: 'V',
				options: { listItems: 'A,B' },
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			textCustomFields: [{ name: 'N', value: 'V' }],
		});
	});
});

describe('customField: update', () => {
	it('updates by field ID and can rename the field', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'text',
				fieldId: '7',
				fieldValue: 'CC-43',
				options: { fieldName: 'Renamed' },
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.body).toEqual({
			textCustomFields: [{ fieldId: '7', value: 'CC-43', name: 'Renamed' }],
		});
	});

	it('leaves the name out when it should stay as it is', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				fieldType: 'list',
				fieldId: '7',
				fieldValue: 'US',
				options: {},
			},
			responses: [{}],
		});

		await customFieldOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			listCustomFields: [{ fieldId: '7', value: 'US' }],
		});
	});
});

describe('customField: delete', () => {
	it('deletes by field ID in the matching collection', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, fieldType: 'list', fieldId: '9' },
			responses: [{}],
		});

		await customFieldOperationHandlers.delete(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('DELETE');
		expect(ctx.requests[0].options.body).toEqual({ listCustomFields: [{ fieldId: '9' }] });
	});
});
