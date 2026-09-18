import { describe, expect, it } from 'vitest';

import { folderOperationHandlers } from '../../../../nodes/Docusign/actions/folder';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

describe('folder: getAll', () => {
	it('flattens the folders array', async () => {
		const ctx = createExecuteFunctions({
			parameters: { options: {} },
			responses: [{ folders: [{ folderId: 'f1' }, { folderId: 'f2' }] }],
		});

		const items = await folderOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/folders`);
		expect(items.map((item) => item.json.folderId)).toEqual(['f1', 'f2']);
	});

	it('translates the options into Docusign query parameters', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				options: { includeTemplates: true, subFolders: true, userFilter: 'owned_by_me' },
			},
			responses: [{ folders: [] }],
		});

		await folderOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({
			template: 'include',
			sub_folders: true,
			user_filter: 'owned_by_me',
		});
	});

	it('falls back to the raw payload when there are no folders', async () => {
		const ctx = createExecuteFunctions({
			parameters: { options: {} },
			responses: [{ resultSetSize: '0' }],
		});

		const items = await folderOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ resultSetSize: '0' });
	});
});

describe('folder: getItems', () => {
	it('reads the paginated folderItems property', async () => {
		const ctx = createExecuteFunctions({
			parameters: { folderId: 'f1', returnAll: true, filters: {} },
			responses: [
				{ folderItems: [{ envelopeId: 'e1' }], resultSetSize: 1, totalSetSize: 1 },
			],
		});

		const items = await folderOperationHandlers.getItems(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/folders/f1`);
		expect(items.map((item) => item.json.envelopeId)).toEqual(['e1']);
	});

	it('maps every filter onto its query parameter', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				folderId: 'f1',
				returnAll: true,
				filters: {
					fromDate: '2026-01-01T00:00:00.000Z',
					toDate: '2026-02-01T00:00:00.000Z',
					ownerEmail: 'ada@example.com',
					ownerName: 'Ada',
					searchText: 'contract',
					status: ['sent', 'completed'],
				},
			},
			responses: [{ folderItems: [], resultSetSize: 0 }],
		});

		await folderOperationHandlers.getItems(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toMatchObject({
			from_date: '2026-01-01T00:00:00.000Z',
			to_date: '2026-02-01T00:00:00.000Z',
			owner_email: 'ada@example.com',
			owner_name: 'Ada',
			search_text: 'contract',
			status: 'sent,completed',
		});
	});

	it('adds no implicit date window, unlike the envelope search', async () => {
		const ctx = createExecuteFunctions({
			parameters: { folderId: 'f1', returnAll: true, filters: {} },
			responses: [{ folderItems: [], resultSetSize: 0 }],
		});

		await folderOperationHandlers.getItems(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).not.toHaveProperty('from_date');
	});

	it('respects the limit', async () => {
		const ctx = createExecuteFunctions({
			parameters: { folderId: 'f1', returnAll: false, limit: 1, filters: {} },
			responses: [
				{
					folderItems: [{ envelopeId: 'a' }, { envelopeId: 'b' }],
					resultSetSize: 2,
					totalSetSize: 9,
				},
			],
		});

		const items = await folderOperationHandlers.getItems(ctx, 0, testDocusignContext);

		expect(items).toHaveLength(1);
	});
});

describe('folder: move', () => {
	it('PUTs the envelope IDs to the target folder', async () => {
		const ctx = createExecuteFunctions({
			parameters: { folderId: 'f2', envelopeIds: 'e1, e2' },
			responses: [{ envelopes: [] }],
		});

		await folderOperationHandlers.move(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/folders/f2`);
		expect(ctx.requests[0].options.body).toEqual({ envelopeIds: ['e1', 'e2'] });
	});
});
