import { createVerify, generateKeyPairSync } from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { createJwtAssertion, normalizePrivateKey } from '../../shared/jwt';

/** Generated per run, so no private key material is ever committed. */
let privateKey: string;
let publicKey: string;

beforeAll(() => {
	const keyPair = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'spki', format: 'pem' },
	});

	privateKey = keyPair.privateKey;
	publicKey = keyPair.publicKey;
});

function decodeSegment(segment: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

const baseOptions = () => ({
	environment: 'demo' as const,
	integrationKey: 'integration-key',
	userId: 'user-guid',
	privateKey,
	scopes: 'signature impersonation',
	issuedAt: 1_700_000_000,
});

describe('createJwtAssertion', () => {
	it('produces three base64url segments without padding', () => {
		const assertion = createJwtAssertion(baseOptions());
		const segments = assertion.split('.');

		expect(segments).toHaveLength(3);
		for (const segment of segments) {
			expect(segment).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('sets the RS256 header Docusign expects', () => {
		const [header] = createJwtAssertion(baseOptions()).split('.');

		expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
	});

	it('maps the credential fields onto the documented claims', () => {
		const [, payload] = createJwtAssertion(baseOptions()).split('.');

		expect(decodeSegment(payload)).toEqual({
			iss: 'integration-key',
			sub: 'user-guid',
			aud: 'account-d.docusign.com',
			iat: 1_700_000_000,
			exp: 1_700_003_600,
			scope: 'signature impersonation',
		});
	});

	it('uses a one hour lifetime, the maximum Docusign accepts', () => {
		const [, payload] = createJwtAssertion(baseOptions()).split('.');
		const claims = decodeSegment(payload) as { iat: number; exp: number };

		expect(claims.exp - claims.iat).toBe(3600);
	});

	it('switches the audience for production', () => {
		const [, payload] = createJwtAssertion({
			...baseOptions(),
			environment: 'production',
		}).split('.');

		expect((decodeSegment(payload) as { aud: string }).aud).toBe('account.docusign.com');
	});

	it('defaults iat to the current clock when not given', () => {
		const before = Math.floor(Date.now() / 1000);
		const options = baseOptions();
		delete (options as { issuedAt?: number }).issuedAt;

		const [, payload] = createJwtAssertion(options).split('.');
		const claims = decodeSegment(payload) as { iat: number };

		expect(claims.iat).toBeGreaterThanOrEqual(before);
		expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
	});

	it('signs the exact "header.payload" input so the assertion verifies', () => {
		const assertion = createJwtAssertion(baseOptions());
		const [header, payload, signature] = assertion.split('.');

		const verified = createVerify('RSA-SHA256')
			.update(`${header}.${payload}`)
			.verify(publicKey, Buffer.from(signature, 'base64url'));

		expect(verified).toBe(true);
	});

	it('does not verify against a different key', () => {
		const other = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
			publicKeyEncoding: { type: 'spki', format: 'pem' },
		});

		const [header, payload, signature] = createJwtAssertion(baseOptions()).split('.');

		const verified = createVerify('RSA-SHA256')
			.update(`${header}.${payload}`)
			.verify(other.publicKey, Buffer.from(signature, 'base64url'));

		expect(verified).toBe(false);
	});

	it('accepts a key whose newlines arrived escaped', () => {
		const escaped = privateKey.replace(/\n/g, '\\n');

		expect(() => createJwtAssertion({ ...baseOptions(), privateKey: escaped })).not.toThrow();
	});

	it('explains a missing private key', () => {
		expect(() => createJwtAssertion({ ...baseOptions(), privateKey: '' })).toThrow(
			/No private key was provided/,
		);
	});

	it('explains a key that is not PEM encoded rather than failing in OpenSSL', () => {
		expect(() => createJwtAssertion({ ...baseOptions(), privateKey: 'not-a-key' })).toThrow(
			/not in PEM format/,
		);
	});

	it('reports a PEM-shaped but unusable key with the underlying reason', () => {
		const broken = '-----BEGIN RSA PRIVATE KEY-----\nnot-base64\n-----END RSA PRIVATE KEY-----';

		expect(() => createJwtAssertion({ ...baseOptions(), privateKey: broken })).toThrow(
			/Could not sign the Docusign JWT assertion/,
		);
	});

	it('rejects an unknown environment', () => {
		expect(() => createJwtAssertion({ ...baseOptions(), environment: 'sandbox' })).toThrow(
			/Unknown Docusign environment/,
		);
	});
});

describe('normalizePrivateKey', () => {
	it('converts escaped newlines into real ones', () => {
		expect(normalizePrivateKey('a\\nb')).toBe('a\nb');
	});

	it('converts escaped CRLF sequences', () => {
		expect(normalizePrivateKey('a\\r\\nb')).toBe('a\nb');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizePrivateKey('  key  ')).toBe('key');
	});
});
