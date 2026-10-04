import { createSign } from 'crypto';

import {
	base64UrlEncode,
	getOAuthAudience,
	JWT_LIFETIME_SECONDS,
	type DocusignEnvironment,
} from './docusign';

export interface JwtAssertionOptions {
	environment: DocusignEnvironment | string;
	/** Docusign Integration Key of the app, used as the `iss` claim. */
	integrationKey: string;
	/** GUID of the user to impersonate, used as the `sub` claim. */
	userId: string;
	/** RSA private key in PEM format. */
	privateKey: string;
	/** Space-separated scope list, e.g. `signature impersonation`. */
	scopes: string;
	/** Unix seconds; injectable so tests do not depend on the clock. */
	issuedAt?: number;
}

const PEM_PATTERN = /-----BEGIN (?:RSA )?PRIVATE KEY-----/;

/**
 * Normalises a private key pasted into the n8n credential form.
 *
 * Keys copied out of JSON or environment variables often arrive with literal
 * `\n` sequences instead of real newlines, which makes OpenSSL reject them with
 * an unhelpful error.
 */
export function normalizePrivateKey(privateKey: string): string {
	return privateKey.replace(/\\r\\n|\\n|\\r/g, '\n').trim();
}

/**
 * Builds and signs the RS256 assertion for the Docusign JWT grant flow.
 *
 * @throws when the private key is missing or is not a PEM-encoded RSA key
 */
export function createJwtAssertion(options: JwtAssertionOptions): string {
	const privateKey = normalizePrivateKey(options.privateKey ?? '');

	if (privateKey === '') {
		throw new Error('No private key was provided for the Docusign JWT grant.');
	}

	if (!PEM_PATTERN.test(privateKey)) {
		throw new Error(
			'The private key is not in PEM format. Paste the full key including the "-----BEGIN RSA PRIVATE KEY-----" and "-----END RSA PRIVATE KEY-----" lines.',
		);
	}

	const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);

	const header = {
		alg: 'RS256',
		typ: 'JWT',
	};

	const payload = {
		iss: options.integrationKey,
		sub: options.userId,
		aud: getOAuthAudience(options.environment),
		iat: issuedAt,
		exp: issuedAt + JWT_LIFETIME_SECONDS,
		scope: options.scopes,
	};

	const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
		JSON.stringify(payload),
	)}`;

	let signature: string | undefined;
	let signingFailure: string | undefined;

	try {
		signature = base64UrlEncode(createSign('RSA-SHA256').update(signingInput).sign(privateKey));
	} catch (error) {
		signingFailure = error instanceof Error ? error.message : String(error);
	}

	if (signature === undefined) {
		throw new Error(
			`Could not sign the Docusign JWT assertion with the given private key: ${signingFailure}`,
		);
	}

	return `${signingInput}.${signature}`;
}
