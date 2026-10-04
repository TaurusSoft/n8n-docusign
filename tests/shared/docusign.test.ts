import { describe, expect, it } from 'vitest';

import {
	base64UrlEncode,
	buildAccountApiBaseUrl,
	buildConsentUrl,
	ESIGNATURE_API_VERSION,
	getOAuthAudience,
	getOAuthBaseUrl,
	normalizeAccountBaseUrl,
} from '../../shared/docusign';

describe('getOAuthBaseUrl', () => {
	it('uses the developer host for demo', () => {
		expect(getOAuthBaseUrl('demo')).toBe('https://account-d.docusign.com');
	});

	it('uses the production host for production', () => {
		expect(getOAuthBaseUrl('production')).toBe('https://account.docusign.com');
	});

	it('rejects an unknown environment instead of silently defaulting', () => {
		expect(() => getOAuthBaseUrl('staging')).toThrow(/Unknown Docusign environment "staging"/);
	});
});

describe('getOAuthAudience', () => {
	it('returns the host without a scheme, as the JWT aud claim requires', () => {
		expect(getOAuthAudience('demo')).toBe('account-d.docusign.com');
		expect(getOAuthAudience('production')).toBe('account.docusign.com');
	});

	it('rejects an unknown environment', () => {
		expect(() => getOAuthAudience('nope')).toThrow(/Unknown Docusign environment/);
	});
});

describe('buildConsentUrl', () => {
	it('builds a consent URL with all required query parameters', () => {
		const url = new URL(
			buildConsentUrl('demo', 'integration-key', 'signature impersonation', 'https://app.test/cb'),
		);

		expect(url.origin).toBe('https://account-d.docusign.com');
		expect(url.pathname).toBe('/oauth/auth');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('client_id')).toBe('integration-key');
		expect(url.searchParams.get('scope')).toBe('signature impersonation');
		expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/cb');
	});
});

describe('base64UrlEncode', () => {
	it('replaces the base64 alphabet and strips padding', () => {
		// 0xFB 0xFF encodes to "+/8=" in standard base64.
		expect(base64UrlEncode(Buffer.from([0xfb, 0xff]))).toBe('-_8');
	});

	it('accepts a string and encodes it as UTF-8', () => {
		expect(base64UrlEncode('AB')).toBe('QUI');
	});

	it('never emits characters outside the base64url alphabet', () => {
		const encoded = base64UrlEncode(Buffer.from([0xfb, 0xef, 0xbe, 0xff, 0x00, 0x7f]));

		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe('normalizeAccountBaseUrl', () => {
	it('strips trailing slashes', () => {
		expect(normalizeAccountBaseUrl('https://demo.docusign.net/')).toBe('https://demo.docusign.net');
	});

	it('strips a restapi suffix so a full base_uri can be pasted in', () => {
		expect(normalizeAccountBaseUrl('https://demo.docusign.net/restapi/v2.1/accounts/123')).toBe(
			'https://demo.docusign.net',
		);
	});

	it('leaves a clean host untouched', () => {
		expect(normalizeAccountBaseUrl('https://na3.docusign.net')).toBe('https://na3.docusign.net');
	});
});

describe('buildAccountApiBaseUrl', () => {
	it('assembles the account-scoped API base', () => {
		expect(buildAccountApiBaseUrl('https://demo.docusign.net', 'acc-1')).toBe(
			`https://demo.docusign.net/restapi/${ESIGNATURE_API_VERSION}/accounts/acc-1`,
		);
	});

	it('normalises the base URL first', () => {
		expect(
			buildAccountApiBaseUrl('https://demo.docusign.net/restapi/v2.1/accounts/old', 'new'),
		).toBe('https://demo.docusign.net/restapi/v2.1/accounts/new');
	});
});
