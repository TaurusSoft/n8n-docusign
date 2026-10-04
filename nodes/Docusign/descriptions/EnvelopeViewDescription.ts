import type { INodeProperties } from 'n8n-workflow';

export const envelopeViewOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['envelopeView'],
			},
		},
		options: [
			{
				name: 'Create Correct View',
				value: 'correct',
				description: 'Create a URL for correcting a sent envelope',
				action: 'Create a correct view',
			},
			{
				name: 'Create Recipient View',
				value: 'recipient',
				description: 'Create a signing URL for an embedded recipient',
				action: 'Create a recipient view',
			},
			{
				name: 'Create Sender View',
				value: 'sender',
				description: 'Create a URL for reviewing and sending a draft envelope',
				action: 'Create a sender view',
			},
		],
		default: 'recipient',
	},
];

export const envelopeViewFields: INodeProperties[] = [
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelopeView'],
			},
		},
		description: 'ID of the envelope the view is created for',
	},
	{
		displayName: 'Return URL',
		name: 'returnUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://example.com/signing-complete',
		displayOptions: {
			show: {
				resource: ['envelopeView'],
			},
		},
		description: 'URL Docusign redirects to once the recipient finishes or cancels',
	},
	{
		displayName: 'Recipient Name',
		name: 'recipientName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelopeView'],
				operation: ['recipient'],
			},
		},
		description: 'Name of the recipient, matching the name on the envelope exactly',
	},
	{
		displayName: 'Recipient Email',
		name: 'recipientEmail',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelopeView'],
				operation: ['recipient'],
			},
		},
		description: 'Email of the recipient, matching the email on the envelope exactly',
	},
	{
		displayName: 'Client User ID',
		name: 'clientUserId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelopeView'],
				operation: ['recipient'],
			},
		},
		description:
			'The client user ID the recipient was created with. Embedded signing only works for recipients that have one.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['envelopeView'],
				operation: ['recipient'],
			},
		},
		options: [
			{
				displayName: 'Authentication Method',
				name: 'authenticationMethod',
				type: 'options',
				options: [
					{ name: 'Email', value: 'email' },
					{ name: 'ID Check', value: 'idCheck' },
					{ name: 'None', value: 'none' },
					{ name: 'Password', value: 'password' },
					{ name: 'Single Sign On', value: 'singleSignOn' },
					{ name: 'Two Factor Auth', value: 'twoFactorAuth' },
				],
				default: 'none',
				description:
					'How your application authenticated the recipient before requesting the signing URL. Recorded in the envelope audit trail.',
			},
			{
				displayName: 'Frame Ancestors',
				name: 'frameAncestors',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of origins allowed to embed the signing URL in an iframe. Required when signing inside your own page.',
			},
			{
				displayName: 'Message Origins',
				name: 'messageOrigins',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of origins allowed to receive postMessage events from the signing session',
			},
			{
				displayName: 'Recipient ID',
				name: 'recipientId',
				type: 'string',
				default: '',
				description: 'ID of the recipient within the envelope',
			},
		],
	},
];
