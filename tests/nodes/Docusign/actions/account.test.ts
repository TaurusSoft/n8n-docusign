import { describe, expect, it } from 'vitest';

import { accountOperationHandlers } from '../../../../nodes/Docusign/actions/account';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

describe('account: get', () => {
	it('requests the account root without a trailing path segment', async () => {
		const ctx = createExecuteFunctions({
			parameters: { options: {} },
			responses: [{ accountName: 'Primary Account' }],
		});

		const items = await accountOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(API_BASE_URL);
		expect(items[0].json.accountName).toBe('Primary Account');
	});

	it('asks for the account settings when requested', async () => {
		const ctx = createExecuteFunctions({
			parameters: { options: { includeAccountSettings: true } },
			responses: [{}],
		});

		await accountOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ include_account_settings: true });
	});

	it('sends no query by default', async () => {
		const ctx = createExecuteFunctions({ parameters: { options: {} }, responses: [{}] });

		await accountOperationHandlers.get(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toBeUndefined();
	});
});
