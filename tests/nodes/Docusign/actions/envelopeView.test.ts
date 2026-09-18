import { describe, expect, it } from 'vitest';

import { envelopeViewOperationHandlers } from '../../../../nodes/Docusign/actions/envelopeView';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

const ENVELOPE_ID = 'env-1';

const recipientParameters = (options: Record<string, unknown> = {}) => ({
	envelopeId: ENVELOPE_ID,
	returnUrl: 'https://app.test/done',
	recipientName: 'Ada',
	recipientEmail: 'ada@example.com',
	clientUserId: 'client-1',
	options,
});

describe('envelopeView: recipient', () => {
	it('posts the identifying fields Docusign matches the recipient on', async () => {
		const ctx = createExecuteFunctions({
			parameters: recipientParameters(),
			responses: [{ url: 'https://demo.docusign.net/signing/abc' }],
		});

		const items = await envelopeViewOperationHandlers.recipient(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('POST');
		expect(ctx.requests[0].options.url).toBe(
			`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/views/recipient`,
		);
		expect(ctx.requests[0].options.body).toEqual({
			returnUrl: 'https://app.test/done',
			userName: 'Ada',
			email: 'ada@example.com',
			clientUserId: 'client-1',
			authenticationMethod: 'none',
		});
		expect(items[0].json.url).toBe('https://demo.docusign.net/signing/abc');
	});

	it('records the authentication method when configured', async () => {
		const ctx = createExecuteFunctions({
			parameters: recipientParameters({ authenticationMethod: 'singleSignOn' }),
			responses: [{ url: 'x' }],
		});

		await envelopeViewOperationHandlers.recipient(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toMatchObject({
			authenticationMethod: 'singleSignOn',
		});
	});

	it('adds an explicit recipient ID when given', async () => {
		const ctx = createExecuteFunctions({
			parameters: recipientParameters({ recipientId: '3' }),
			responses: [{ url: 'x' }],
		});

		await envelopeViewOperationHandlers.recipient(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toMatchObject({ recipientId: '3' });
	});

	it('sends the focused view settings when both lists are present', async () => {
		const ctx = createExecuteFunctions({
			parameters: recipientParameters({
				frameAncestors: 'https://app.test, https://other.test',
				messageOrigins: 'https://apps-d.docusign.com',
			}),
			responses: [{ url: 'x' }],
		});

		await envelopeViewOperationHandlers.recipient(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).toMatchObject({
			frameAncestors: ['https://app.test', 'https://other.test'],
			messageOrigins: ['https://apps-d.docusign.com'],
		});
	});

	it('omits the focused view settings when only one list is filled in', async () => {
		const ctx = createExecuteFunctions({
			parameters: recipientParameters({ frameAncestors: 'https://app.test' }),
			responses: [{ url: 'x' }],
		});

		await envelopeViewOperationHandlers.recipient(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.body).not.toHaveProperty('frameAncestors');
		expect(ctx.requests[0].options.body).not.toHaveProperty('messageOrigins');
	});
});

describe('envelopeView: sender and correct', () => {
	it.each([
		['sender', 'views/sender'],
		['correct', 'views/correct'],
	])('posts the return URL for the %s view', async (operation, path) => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, returnUrl: 'https://app.test/back' },
			responses: [{ url: 'https://demo.docusign.net/x' }],
		});

		await envelopeViewOperationHandlers[operation](ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/${path}`);
		expect(ctx.requests[0].options.body).toEqual({ returnUrl: 'https://app.test/back' });
	});
});
