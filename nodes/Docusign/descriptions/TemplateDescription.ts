import type { INodeProperties } from 'n8n-workflow';

import { limitField, returnAllField } from './SharedFields';

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['template'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single template',
				action: 'Get a template',
			},
			{
				name: 'Get Documents',
				value: 'getDocuments',
				description: 'Get the documents of a template',
				action: 'Get documents of a template',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many templates',
				action: 'Get many templates',
			},
			{
				name: 'Get Recipients',
				value: 'getRecipients',
				description: 'Get the recipients and roles of a template',
				action: 'Get recipients of a template',
			},
		],
		default: 'getAll',
	},
];

export const templateFields: INodeProperties[] = [
	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTemplates',
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get', 'getDocuments', 'getRecipients'],
			},
		},
		description:
			'Template to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get'],
			},
		},
		options: [
			{
				displayName: 'Include',
				name: 'include',
				type: 'multiOptions',
				options: [
					{ name: 'Custom Fields', value: 'custom_fields' },
					{ name: 'Documents', value: 'documents' },
					{ name: 'Notification', value: 'notification' },
					{ name: 'Powerforms', value: 'powerforms' },
					{ name: 'Recipients', value: 'recipients' },
					{ name: 'Tabs', value: 'tabs' },
				],
				default: [],
				description: 'Additional template details to include in the response',
			},
		],
	},

	// ----------------------------------
	//         template: getAll
	// ----------------------------------
	{
		...returnAllField,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
			},
		},
	},
	{
		...limitField,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Folder IDs',
				name: 'folderIds',
				type: 'string',
				default: '',
				description: 'Comma-separated folder IDs to restrict the result to',
			},
			{
				displayName: 'Search Text',
				name: 'searchText',
				type: 'string',
				default: '',
				description: 'Only return templates whose name or description matches this text',
			},
			{
				displayName: 'Shared By Me',
				name: 'sharedByMe',
				type: 'boolean',
				default: false,
				description: 'Whether to only return templates shared by the authenticated user',
			},
			{
				displayName: 'User Filter',
				name: 'userFilter',
				type: 'options',
				options: [
					{ name: 'Owned By Me', value: 'owned_by_me' },
					{ name: 'Shared With Me', value: 'shared_with_me' },
					{ name: 'All', value: 'all' },
				],
				default: 'all',
				description: 'Which templates to return with respect to ownership',
			},
		],
	},
];
