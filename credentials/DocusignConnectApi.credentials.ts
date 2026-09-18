import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class DocusignConnectApi implements ICredentialType {
	name = 'docusignConnectApi';

	displayName = 'Docusign Connect HMAC API';

	documentationUrl = 'https://developers.docusign.com/platform/webhooks/connect/hmac/';

	icon = {
		light: 'file:../icons/docusign.svg',
		dark: 'file:../icons/docusign.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName:
				'In Docusign go to Settings &rarr; Connect, open your Connect configuration and add an HMAC secret key. Paste the same secret here so the trigger can verify that incoming webhooks really come from Docusign.',
			name: 'setupNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'HMAC Secret',
			name: 'hmacSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'The HMAC secret key configured on your Docusign Connect configuration',
		},
	];
}
