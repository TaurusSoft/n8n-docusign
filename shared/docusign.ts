/**
 * Helpers shared between the credential classes and the nodes.
 *
 * Kept free of `n8n-workflow` imports and of any I/O so both sides can use it
 * and so every function here is directly unit-testable.
 */

export type DocusignEnvironment = 'demo' | 'production';

export const ESIGNATURE_API_VERSION = 'v2.1';

const OAUTH_HOSTS: Record<DocusignEnvironment, string> = {
	demo: 'https://account-d.docusign.com',
	production: 'https://account.docusign.com',
};

/** JWT `aud` claim, which is the OAuth host without its scheme. */
const OAUTH_AUDIENCES: Record<DocusignEnvironment, string> = {
	demo: 'account-d.docusign.com',
	production: 'account.docusign.com',
};

export const JWT_BEARER_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

/** Docusign JWT assertions may not request a lifetime longer than one hour. */
export const JWT_LIFETIME_SECONDS = 3600;

function assertKnownEnvironment(environment: string): DocusignEnvironment {
	if (environment !== 'demo' && environment !== 'production') {
		throw new Error(
			`Unknown Docusign environment "${environment}". Expected "demo" or "production".`,
		);
	}

	return environment;
}

/** Base URL of the Docusign authentication service, e.g. `https://account-d.docusign.com`. */
export function getOAuthBaseUrl(environment: string): string {
	return OAUTH_HOSTS[assertKnownEnvironment(environment)];
}

/** Host used as the JWT `aud` claim, e.g. `account-d.docusign.com`. */
export function getOAuthAudience(environment: string): string {
	return OAUTH_AUDIENCES[assertKnownEnvironment(environment)];
}

/**
 * Builds the URL a user has to open once to grant an integration permission to
 * impersonate them. Required before the JWT grant flow can issue tokens.
 */
export function buildConsentUrl(
	environment: string,
	integrationKey: string,
	scopes: string,
	redirectUri: string,
): string {
	const query = new URLSearchParams({
		response_type: 'code',
		scope: scopes,
		client_id: integrationKey,
		redirect_uri: redirectUri,
	});

	return `${getOAuthBaseUrl(environment)}/oauth/auth?${query.toString()}`;
}

/** Base64url encoding: standard base64 with `+/` swapped for `-_` and no padding. */
export function base64UrlEncode(input: Buffer | string): string {
	const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;

	return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strips the `/restapi/...` suffix Docusign returns for some base URIs. */
export function normalizeAccountBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '').replace(/\/restapi.*$/, '');
}

/** Full account-scoped eSignature API base, e.g. `https://demo.docusign.net/restapi/v2.1/accounts/123`. */
export function buildAccountApiBaseUrl(baseUrl: string, accountId: string): string {
	return `${normalizeAccountBaseUrl(baseUrl)}/restapi/${ESIGNATURE_API_VERSION}/accounts/${accountId}`;
}
