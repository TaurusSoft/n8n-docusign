import { generateKeyPairSync } from 'crypto';
import type {
	ICredentialDataDecryptedObject,
	IHttpRequestHelper,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DocusignJwtApi } from '../../credentials/DocusignJwtApi.credentials';

const credential = new DocusignJwtApi();

let privateKey: string;

beforeAll(() => {
	privateKey = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'spki', format: 'pem' },
	}).privateKey;
});

function credentials(overrides: ICredentialDataDecryptedObject = {}) {
	return {
		environment: 'demo',
		integrationKey: 'integration-key',
		userId: 'user-guid',
		privateKey,
		scopes: 'signature impersonation',
		...overrides,
	};
}

/** Minimal `IHttpRequestHelper` that records the token request. */
function helper(response: unknown, shouldThrow?: unknown) {
	const httpRequest = vi.fn(async () => {
		if (shouldThrow !== undefined) {
			throw shouldThrow;
		}

		return response;
	});

	return {
		context: { helpers: { httpRequest } } as unknown as IHttpRequestHelper,
		httpRequest,
	};
}

function lastRequest(httpRequest: { mock: { calls: unknown[][] } }): IHttpRequestOptions {
	return httpRequest.mock.calls.at(-1)?.[0] as IHttpRequestOptions;
}

describe('DocusignJwtApi metadata', () => {
	it('is a standalone credential, not an OAuth2 extension', () => {
		expect(credential.name).toBe('docusignJwtApi');
		expect((credential as { extends?: string[] }).extends).toBeUndefined();
	});

	it('marks the private key as a password field so it is not shown in the UI', () => {
		const property = credential.properties.find((entry) => entry.name === 'privateKey');

		expect(property?.typeOptions?.password).toBe(true);
	});

	it('requires the fields the grant cannot work without', () => {
		for (const name of ['integrationKey', 'userId', 'privateKey']) {
			const property = credential.properties.find((entry) => entry.name === name);

			expect(property?.required, `${name} must be required`).toBe(true);
		}
	});

	it('defaults to the impersonation scope the JWT grant needs', () => {
		const scopes = credential.properties.find((entry) => entry.name === 'scopes')
			?.default as string;

		expect(scopes.split(' ')).toContain('impersonation');
		expect(scopes.split(' ')).toContain('signature');
	});

	it('sends the resolved token as a bearer header', () => {
		expect(credential.authenticate.properties.headers?.Authorization).toBe(
			'=Bearer {{$credentials.sessionToken}}',
		);
	});

	it('tests the connection against the userinfo endpoint', () => {
		expect(credential.test.request.url).toBe('/oauth/userinfo');
	});
});

describe('DocusignJwtApi.preAuthentication', () => {
	it('exchanges a signed assertion for an access token', async () => {
		const { context, httpRequest } = helper({ access_token: 'token-123', expires_in: 3600 });

		const result = await credential.preAuthentication.call(context, credentials());

		expect(result).toEqual({ sessionToken: 'token-123' });
		expect(httpRequest).toHaveBeenCalledTimes(1);
	});

	it('posts form-encoded data to the token endpoint of the chosen environment', async () => {
		const { context, httpRequest } = helper({ access_token: 'token-123' });

		await credential.preAuthentication.call(context, credentials());
		const request = lastRequest(httpRequest);

		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://account-d.docusign.com/oauth/token');
		expect(request.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
	});

	it('uses the production token endpoint when configured', async () => {
		const { context, httpRequest } = helper({ access_token: 'token-123' });

		await credential.preAuthentication.call(
			context,
			credentials({ environment: 'production' }),
		);

		expect(lastRequest(httpRequest).url).toBe('https://account.docusign.com/oauth/token');
	});

	it('sends the documented grant type and a three-segment assertion', async () => {
		const { context, httpRequest } = helper({ access_token: 'token-123' });

		await credential.preAuthentication.call(context, credentials());
		const body = new URLSearchParams(lastRequest(httpRequest).body as string);

		expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
		expect(body.get('assertion')?.split('.')).toHaveLength(3);
	});

	it('turns consent_required into an actionable consent URL', async () => {
		const { context } = helper(undefined, {
			response: { body: { error: 'consent_required' } },
		});

		await expect(credential.preAuthentication.call(context, credentials())).rejects.toThrow(
			/account-d\.docusign\.com\/oauth\/auth\?response_type=code/,
		);
	});

	it('includes the integration key and scopes in the consent URL', async () => {
		const { context } = helper(undefined, {
			response: { body: { error: 'consent_required' } },
		});

		const error = await credential
			.preAuthentication.call(context, credentials())
			.catch((caught: Error) => caught);

		expect((error as Error).message).toContain('client_id=integration-key');
		expect((error as Error).message).toContain('impersonation');
	});

	it('parses a stringified error body', async () => {
		const { context } = helper(undefined, {
			response: { body: JSON.stringify({ error: 'consent_required' }) },
		});

		await expect(credential.preAuthentication.call(context, credentials())).rejects.toThrow(
			/requires consent/,
		);
	});

	it('explains invalid_grant in terms of what to check', async () => {
		const { context } = helper(undefined, {
			response: { body: { error: 'invalid_grant' } },
		});

		await expect(credential.preAuthentication.call(context, credentials())).rejects.toThrow(
			/Verify the Integration Key, the User ID/,
		);
	});

	it('falls back to the transport message for unexpected failures', async () => {
		const { context } = helper(undefined, new Error('socket hang up'));

		await expect(credential.preAuthentication.call(context, credentials())).rejects.toThrow(
			/socket hang up/,
		);
	});

	it('fails clearly when Docusign answers without an access token', async () => {
		const { context } = helper({ token_type: 'Bearer' });

		await expect(credential.preAuthentication.call(context, credentials())).rejects.toThrow(
			/did not return an access token/,
		);
	});

	it('propagates a private key problem instead of calling the API', async () => {
		const { context, httpRequest } = helper({ access_token: 'token-123' });

		await expect(
			credential.preAuthentication.call(context, credentials({ privateKey: 'nonsense' })),
		).rejects.toThrow(/not in PEM format/);

		expect(httpRequest).not.toHaveBeenCalled();
	});
});
