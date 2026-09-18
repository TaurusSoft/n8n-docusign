import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { DocusignOAuth2Api } from '../../credentials/DocusignOAuth2Api.credentials';

const credential = new DocusignOAuth2Api();

function propertyFor(name: string, environment?: 'demo' | 'production'): INodeProperties {
	const matches = credential.properties.filter((property) => property.name === name);

	const match =
		environment === undefined
			? matches[0]
			: matches.find((property) =>
					property.displayOptions?.show?.environment?.includes(environment),
				);

	if (match === undefined) {
		throw new Error(`No property "${name}" for environment "${environment ?? 'any'}"`);
	}

	return match;
}

describe('DocusignOAuth2Api', () => {
	it('extends the built-in OAuth2 credential so n8n handles the token dance', () => {
		expect(credential.extends).toEqual(['oAuth2Api']);
		expect(credential.name).toBe('docusignOAuth2Api');
	});

	it('uses the authorization code grant', () => {
		expect(propertyFor('grantType').default).toBe('authorizationCode');
	});

	it('points at the developer hosts for demo', () => {
		expect(propertyFor('authUrl', 'demo').default).toBe(
			'https://account-d.docusign.com/oauth/auth',
		);
		expect(propertyFor('accessTokenUrl', 'demo').default).toBe(
			'https://account-d.docusign.com/oauth/token',
		);
	});

	it('points at the production hosts for production', () => {
		expect(propertyFor('authUrl', 'production').default).toBe(
			'https://account.docusign.com/oauth/auth',
		);
		expect(propertyFor('accessTokenUrl', 'production').default).toBe(
			'https://account.docusign.com/oauth/token',
		);
	});

	it('requests the extended scope, without which the refresh token cannot be renewed', () => {
		const scope = propertyFor('scope').default as string;

		expect(scope.split(' ')).toContain('signature');
		expect(scope.split(' ')).toContain('extended');
	});

	it('sends the token in a header rather than the body', () => {
		expect(propertyFor('authentication').default).toBe('header');
	});

	it('defaults to the demo environment so nobody hits production by accident', () => {
		expect(propertyFor('environment').default).toBe('demo');
	});

	it('offers both environments and nothing else', () => {
		const options = propertyFor('environment').options as Array<{ value: string }>;

		expect(options.map((option) => option.value).sort()).toEqual(['demo', 'production']);
	});

	it('keeps the account overrides optional', () => {
		expect(propertyFor('accountId').required).toBeUndefined();
		expect(propertyFor('accountBaseUrl').required).toBeUndefined();
	});

	it('declares every environment-specific URL exactly twice, once per environment', () => {
		for (const name of ['authUrl', 'accessTokenUrl']) {
			const environments = credential.properties
				.filter((property) => property.name === name)
				.map((property) => property.displayOptions?.show?.environment);

			expect(environments).toEqual([['demo'], ['production']]);
		}
	});

	it('tests the connection against the userinfo endpoint of the chosen environment', () => {
		expect(credential.test.request.url).toBe('/oauth/userinfo');
		expect(credential.test.request.baseURL).toContain('account-d.docusign.com');
		expect(credential.test.request.baseURL).toContain('account.docusign.com');
	});
});
