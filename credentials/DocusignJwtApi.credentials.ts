import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialType,
	IDataObject,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

import { buildConsentUrl, getOAuthBaseUrl, JWT_BEARER_GRANT_TYPE } from '../shared/docusign';
import { createJwtAssertion } from '../shared/jwt';

export class DocusignJwtApi implements ICredentialType {
	name = 'docusignJwtApi';

	displayName = 'Docusign JWT API';

	documentationUrl = 'https://developers.docusign.com/platform/auth/jwt/';

	icon = {
		light: 'file:../icons/docusign.svg',
		dark: 'file:../icons/docusign.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName:
				'Use this for unattended workflows. Create an app in the <a href="https://developers.docusign.com/" target="_blank">Docusign Developer Center</a>, generate an RSA keypair for it, and grant the app consent to impersonate the user below once.',
			name: 'setupNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{
					name: 'Demo (Developer Sandbox)',
					value: 'demo',
				},
				{
					name: 'Production',
					value: 'production',
				},
			],
			default: 'demo',
			description:
				'Docusign keeps developer and production accounts on separate hosts. Switch to production only after your integration has gone live.',
		},
		{
			displayName: 'Integration Key',
			name: 'integrationKey',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 1a2b3c4d-5e6f-7890-abcd-ef1234567890',
			description: 'The Integration Key (client ID) of your Docusign app',
		},
		{
			displayName: 'User ID',
			name: 'userId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 1a2b3c4d-5e6f-7890-abcd-ef1234567890',
			description:
				'API Username (GUID) of the user the app impersonates. Envelopes are sent on behalf of this user, so a dedicated system user is recommended.',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
				rows: 6,
			},
			default: '',
			required: true,
			placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
			description:
				'The RSA private key generated for your Docusign app, including the BEGIN and END lines',
		},
		{
			displayName: 'Scopes',
			name: 'scopes',
			type: 'string',
			default: 'signature impersonation',
			description:
				'Space-separated scopes to request. The JWT grant flow always needs "impersonation" in addition to "signature".',
		},
		{
			displayName: 'Consent Redirect URI',
			name: 'consentRedirectUri',
			type: 'string',
			default: '',
			placeholder: 'e.g. https://www.docusign.com',
			description:
				'One of the Redirect URIs registered for your app. It is only used to build the one-time consent URL and never called, but Docusign refuses a consent URL carrying a redirect URI it does not know.',
		},
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			placeholder: 'e.g. 1a2b3c4d-5e6f-7890-abcd-ef1234567890',
			description:
				'The Docusign account (API account ID) to operate on. Leave empty to use the default account of the impersonated user.',
		},
		{
			displayName: 'Account Base URL',
			name: 'accountBaseUrl',
			type: 'string',
			default: '',
			placeholder: 'e.g. https://demo.docusign.net',
			description:
				'Only set this to skip the automatic account lookup. When empty, the account base URL is resolved from the userinfo endpoint.',
		},
	];

	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const environment = (credentials.environment as string) ?? 'demo';
		const integrationKey = (credentials.integrationKey as string) ?? '';
		const scopes = (credentials.scopes as string) ?? 'signature impersonation';
		const consentRedirectUri = ((credentials.consentRedirectUri as string) ?? '').trim();

		const assertion = createJwtAssertion({
			environment,
			integrationKey,
			userId: (credentials.userId as string) ?? '',
			privateKey: (credentials.privateKey as string) ?? '',
			scopes,
		});

		let response: IDataObject;
		try {
			response = (await this.helpers.httpRequest({
				method: 'POST',
				url: `${getOAuthBaseUrl(environment)}/oauth/token`,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: JWT_BEARER_GRANT_TYPE,
					assertion,
				}).toString(),
				json: true,
			})) as IDataObject;
		} catch (error) {
			throw new Error(
				describeTokenError(error, environment, integrationKey, scopes, consentRedirectUri),
			);
		}

		const accessToken = response.access_token as string | undefined;

		if (!accessToken) {
			throw new Error(
				'Docusign did not return an access token for the JWT assertion. Check the Integration Key, User ID and private key.',
			);
		}

		return { sessionToken: accessToken };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.sessionToken}}',
			},
		},
	};

	test = {
		request: {
			baseURL:
				'={{$credentials.environment === "production" ? "https://account.docusign.com" : "https://account-d.docusign.com"}}',
			url: '/oauth/userinfo',
		},
	};
}

/**
 * Turns a token endpoint failure into something actionable.
 *
 * `consent_required` is by far the most common first-run error, and the fix is
 * always the same: open a URL once. So we build that URL for the user instead of
 * surfacing the bare error code - as far as the credential allows, since that URL
 * needs a redirect URI only the user can supply.
 */
function describeTokenError(
	error: unknown,
	environment: string,
	integrationKey: string,
	scopes: string,
	consentRedirectUri: string,
): string {
	const body = extractErrorBody(error);
	const docusignError = typeof body?.error === 'string' ? body.error : undefined;

	if (docusignError === 'consent_required') {
		if (consentRedirectUri === '') {
			return 'Docusign requires consent before this app can impersonate the user. Granting it means opening a consent URL, and that URL needs a redirect URI Docusign recognises: it only accepts one registered for your app. Add a Redirect URI to the app in the Developer Center - its value does not matter, it is never called - then set it as the Consent Redirect URI on this credential and try again to get the exact URL to open.';
		}

		const consentUrl = buildConsentUrl(environment, integrationKey, scopes, consentRedirectUri);

		return `Docusign requires consent before this app can impersonate the user. Open this URL once in a browser, sign in as the user and accept: ${consentUrl}`;
	}

	if (docusignError === 'invalid_grant') {
		return 'Docusign rejected the JWT assertion (invalid_grant). Verify the Integration Key, the User ID (API Username GUID) and that the private key belongs to this app, and make sure the environment matches the account.';
	}

	const detail =
		docusignError ??
		(error instanceof Error ? error.message : undefined) ??
		'no further details were returned';

	return `Could not obtain a Docusign access token via JWT grant: ${detail}`;
}

function extractErrorBody(error: unknown): IDataObject | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const candidate = error as { response?: { body?: unknown; data?: unknown }; body?: unknown };
	const body = candidate.response?.body ?? candidate.response?.data ?? candidate.body;

	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return undefined;
		}
	}

	return typeof body === 'object' && body !== null ? (body as IDataObject) : undefined;
}
