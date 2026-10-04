import { describe, expect, it } from 'vitest';

import { templateOperationHandlers } from '../../../../nodes/Docusign/actions/template';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

describe('template: get', () => {
	it('gets a template by ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1', options: {} },
			responses: [{ templateId: 'tpl-1', name: 'NDA' }],
		});

		const items = await templateOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/templates/tpl-1`);
		expect(items[0].json.name).toBe('NDA');
	});

	it('joins the include option', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1', options: { include: ['recipients', 'tabs'] } },
			responses: [{}],
		});

		await templateOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ include: 'recipients,tabs' });
	});
});

describe('template: getAll', () => {
	it('reads the paginated envelopeTemplates property', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: true, filters: {} },
			responses: [
				{
					envelopeTemplates: [{ templateId: 'a' }, { templateId: 'b' }],
					resultSetSize: 2,
					totalSetSize: 2,
				},
			],
		});

		const items = await templateOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/templates`);
		expect(items.map((item) => item.json.templateId)).toEqual(['a', 'b']);
	});

	it('maps the filters onto query parameters', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				returnAll: true,
				filters: {
					searchText: 'nda',
					folderIds: 'f1, f2',
					userFilter: 'owned_by_me',
					sharedByMe: true,
				},
			},
			responses: [{ envelopeTemplates: [], resultSetSize: 0 }],
		});

		await templateOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toMatchObject({
			search_text: 'nda',
			folder_ids: 'f1,f2',
			user_filter: 'owned_by_me',
			shared_by_me: true,
		});
	});

	it('respects the limit', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: false, limit: 1, filters: {} },
			responses: [
				{
					envelopeTemplates: [{ templateId: 'a' }, { templateId: 'b' }],
					resultSetSize: 2,
					totalSetSize: 5,
				},
			],
		});

		const items = await templateOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items).toHaveLength(1);
	});
});

describe('template: getDocuments', () => {
	it('flattens templateDocuments', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1' },
			responses: [{ templateDocuments: [{ documentId: '1' }] }],
		});

		const items = await templateOperationHandlers.getDocuments(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/templates/tpl-1/documents`);
		expect(items).toHaveLength(1);
	});

	it('falls back to the raw payload when empty', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1' },
			responses: [{ templateId: 'tpl-1' }],
		});

		const items = await templateOperationHandlers.getDocuments(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ templateId: 'tpl-1' });
	});
});

describe('template: getRecipients', () => {
	it('merges signers and carbon copies', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1' },
			responses: [
				{ signers: [{ roleName: 'Signer 1' }], carbonCopies: [{ roleName: 'Watcher' }] },
			],
		});

		const items = await templateOperationHandlers.getRecipients(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/templates/tpl-1/recipients`);
		expect(items.map((item) => item.json.roleName)).toEqual(['Signer 1', 'Watcher']);
	});

	it('includes the roles beyond signers and carbon copies', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1' },
			responses: [
				{
					signers: [{ roleName: 'Signer 1' }],
					agents: [{ roleName: 'Agent' }],
					certifiedDeliveries: [{ roleName: 'Archive' }],
					editors: [{ roleName: 'Editor' }],
				},
			],
		});

		const items = await templateOperationHandlers.getRecipients(ctx, 0, testDocusignContext);

		expect(items.map((item) => item.json.roleName).sort()).toEqual([
			'Agent',
			'Archive',
			'Editor',
			'Signer 1',
		]);
		expect(items.map((item) => item.json.recipientType)).toContain('agent');
	});

	it('falls back to the raw payload when empty', async () => {
		const ctx = createExecuteFunctions({
			parameters: { templateId: 'tpl-1' },
			responses: [{ recipientCount: '0' }],
		});

		const items = await templateOperationHandlers.getRecipients(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ recipientCount: '0' });
	});
});
