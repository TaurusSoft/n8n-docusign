import { describe, expect, it } from 'vitest';

import { userOperationHandlers } from '../../../../nodes/Docusign/actions/user';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

describe('user: get', () => {
	it('gets a user by ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: { userId: 'u1', options: {} },
			responses: [{ userId: 'u1', userName: 'Ada' }],
		});

		const items = await userOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/users/u1`);
		expect(items[0].json.userName).toBe('Ada');
	});

	it('requests the additional info when asked', async () => {
		const ctx = createExecuteFunctions({
			parameters: { userId: 'u1', options: { additionalInfo: true } },
			responses: [{}],
		});

		await userOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ additional_info: true });
	});
});

describe('user: getAll', () => {
	it('reads the paginated users property', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: true, filters: {}, options: {} },
			responses: [{ users: [{ userId: 'a' }, { userId: 'b' }], resultSetSize: 2, totalSetSize: 2 }],
		});

		const items = await userOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/users`);
		expect(items).toHaveLength(2);
	});

	it('maps the filters onto query parameters', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				returnAll: true,
				filters: {
					status: ['Active', 'Closed'],
					email: 'ada@example.com',
					userNameSubstring: 'Ada',
				},
				options: { additionalInfo: true },
			},
			responses: [{ users: [], resultSetSize: 0 }],
		});

		await userOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toMatchObject({
			status: 'Active,Closed',
			email: 'ada@example.com',
			user_name_substring: 'Ada',
			additional_info: true,
		});
	});

	it('respects the limit', async () => {
		const ctx = createExecuteFunctions({
			parameters: { returnAll: false, limit: 1, filters: {}, options: {} },
			responses: [{ users: [{ userId: 'a' }, { userId: 'b' }], resultSetSize: 2, totalSetSize: 8 }],
		});

		const items = await userOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(items).toHaveLength(1);
	});
});

describe('user: create', () => {
	it('wraps the new user in the newUsers array the API expects', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				userName: 'Ada Lovelace',
				email: 'ada@example.com',
				additionalFields: {},
			},
			responses: [{ newUsers: [{ userId: 'new-1' }] }],
		});

		const items = await userOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.body).toEqual({
			newUsers: [{ userName: 'Ada Lovelace', email: 'ada@example.com' }],
		});
		expect(items[0].json.userId).toBe('new-1');
	});

	it('adds the optional fields and turns group IDs into a group list', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				userName: 'Ada',
				email: 'ada@example.com',
				additionalFields: {
					firstName: 'Ada',
					lastName: 'Lovelace',
					activationAccessCode: 'code',
					permissionProfileId: 'p1',
					groupIds: 'g1, g2',
				},
			},
			responses: [{ newUsers: [] }],
		});

		await userOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({
			newUsers: [
				{
					userName: 'Ada',
					email: 'ada@example.com',
					firstName: 'Ada',
					lastName: 'Lovelace',
					activationAccessCode: 'code',
					permissionProfileId: 'p1',
					groupList: [{ groupId: 'g1' }, { groupId: 'g2' }],
				},
			],
		});
	});

	it('falls back to the raw payload when the API answers differently', async () => {
		const ctx = createExecuteFunctions({
			parameters: { userName: 'A', email: 'a@e.com', additionalFields: {} },
			responses: [{ errorDetails: null }],
		});

		const items = await userOperationHandlers.create(ctx, 0, testDocusignContext);

		expect(items[0].json).toEqual({ errorDetails: null });
	});
});

describe('user: update', () => {
	it('sends only the filled update fields', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				userId: 'u1',
				updateFields: { userName: 'New Name', email: '', userStatus: 'Active' },
			},
			responses: [{}],
		});

		await userOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/users/u1`);
		expect(ctx.requests[0].options.body).toEqual({
			userName: 'New Name',
			userStatus: 'Active',
		});
	});

	it('sends an empty body when nothing was changed', async () => {
		const ctx = createExecuteFunctions({
			parameters: { userId: 'u1', updateFields: {} },
			responses: [{}],
		});

		await userOperationHandlers.update(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toEqual({});
	});
});

describe('user: delete', () => {
	it('closes the user through the collection endpoint', async () => {
		const ctx = createExecuteFunctions({
			parameters: { userId: 'u1' },
			responses: [{ users: [{ userId: 'u1' }] }],
		});

		await userOperationHandlers.delete(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('DELETE');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/users`);
		expect(ctx.requests[0].options.body).toEqual({ users: [{ userId: 'u1' }] });
	});
});
