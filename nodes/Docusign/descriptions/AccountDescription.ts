import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['account'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get information about the account the credential points at',
				action: 'Get an account',
			},
		],
		default: 'get',
	},
];

export const accountFields: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['get'],
			},
		},
		options: [
			{
				displayName: 'Include Account Settings',
				name: 'includeAccountSettings',
				type: 'boolean',
				default: false,
				description: 'Whether the full list of account settings is included in the response',
			},
		],
	},
];
