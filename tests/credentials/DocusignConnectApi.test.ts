import { describe, expect, it } from 'vitest';

import { DocusignConnectApi } from '../../credentials/DocusignConnectApi.credentials';

const credential = new DocusignConnectApi();

describe('DocusignConnectApi', () => {
	it('is named so the trigger can reference it', () => {
		expect(credential.name).toBe('docusignConnectApi');
	});

	it('carries the API suffix the n8n naming rules expect', () => {
		expect(credential.displayName).toMatch(/API$/);
	});

	it('exposes exactly one secret field plus the setup notice', () => {
		const fieldNames = credential.properties.map((property) => property.name);

		expect(fieldNames).toEqual(['setupNotice', 'hmacSecret']);
	});

	it('masks the HMAC secret in the UI', () => {
		const property = credential.properties.find((entry) => entry.name === 'hmacSecret');

		expect(property?.typeOptions?.password).toBe(true);
		expect(property?.required).toBe(true);
	});

	it('links to the Connect HMAC documentation', () => {
		expect(credential.documentationUrl).toContain('docusign.com');
	});
});
