import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class DocusignOAuth2Api implements ICredentialType {
	name = 'docusignOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Docusign OAuth2 API';

	documentationUrl = 'https://developers.docusign.com/platform/auth/authcode/';

	icon = {
		light: 'file:../icons/docusign.svg',
		dark: 'file:../icons/docusign.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName:
				'Create an app in the <a href="https://developers.docusign.com/" target="_blank">Docusign Developer Center</a>, add the OAuth Redirect URL shown below to it, and enter the app\'s Integration Key and Secret Key here.',
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
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			placeholder: 'e.g. 1a2b3c4d-5e6f-7890-abcd-ef1234567890',
			description:
				'The Docusign account (API account ID) to operate on. Leave empty to use the default account of the authenticated user.',
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

		// --- Hidden OAuth2 wiring -------------------------------------------------
		// Docusign uses different hosts per environment, so each URL is declared
		// twice and switched through displayOptions.
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://account-d.docusign.com/oauth/auth',
			displayOptions: {
				show: {
					environment: ['demo'],
				},
			},
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://account.docusign.com/oauth/auth',
			displayOptions: {
				show: {
					environment: ['production'],
				},
			},
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://account-d.docusign.com/oauth/token',
			displayOptions: {
				show: {
					environment: ['demo'],
				},
			},
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://account.docusign.com/oauth/token',
			displayOptions: {
				show: {
					environment: ['production'],
				},
			},
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			// `extended` is what makes the refresh token renewable. Without it the
			// connection has to be re-authorised by hand once the token expires.
			default: 'signature extended',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];

	test = {
		request: {
			baseURL:
				'={{$credentials.environment === "production" ? "https://account.docusign.com" : "https://account-d.docusign.com"}}',
			url: '/oauth/userinfo',
		},
	};
}
