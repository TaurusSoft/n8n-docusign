import type { INodeProperties } from 'n8n-workflow';

import { envelopeStatusOptions, limitField, returnAllField } from './SharedFields';

export const folderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['folder'],
			},
		},
		options: [
			{
				name: 'Get Items',
				value: 'getItems',
				description: 'Get the envelopes inside a folder',
				action: 'Get items of a folder',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the folders of the account',
				action: 'Get many folders',
			},
			{
				name: 'Move Envelopes',
				value: 'move',
				description: 'Move envelopes into a folder',
				action: 'Move envelopes to a folder',
			},
		],
		default: 'getAll',
	},
];

export const folderFields: INodeProperties[] = [
	{
		displayName: 'Folder Name or ID',
		name: 'folderId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getFolders',
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['folder'],
				operation: ['getItems', 'move'],
			},
		},
		description:
			'Folder to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Envelope IDs',
		name: 'envelopeIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['folder'],
				operation: ['move'],
			},
		},
		description: 'Comma-separated IDs of the envelopes to move into the folder',
	},

	// ----------------------------------
	//         folder: getAll
	// ----------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['folder'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Include Sub Folders',
				name: 'subFolders',
				type: 'boolean',
				default: false,
				description: 'Whether nested folders are included in the result',
			},
			{
				displayName: 'Include Templates',
				name: 'includeTemplates',
				type: 'boolean',
				default: false,
				description: 'Whether template folders are included in the result',
			},
			{
				displayName: 'User Filter',
				name: 'userFilter',
				type: 'options',
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Owned By Me', value: 'owned_by_me' },
					{ name: 'Shared With Me', value: 'shared_with_me' },
				],
				default: 'all',
				description: 'Which folders to return with respect to ownership',
			},
		],
	},

	// ----------------------------------
	//        folder: getItems
	// ----------------------------------
	{
		...returnAllField,
		displayOptions: {
			show: {
				resource: ['folder'],
				operation: ['getItems'],
			},
		},
	},
	{
		...limitField,
		displayOptions: {
			show: {
				resource: ['folder'],
				operation: ['getItems'],
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
				resource: ['folder'],
				operation: ['getItems'],
			},
		},
		options: [
			{
				displayName: 'From Date',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				description: 'Only return envelopes changed after this date',
			},
			{
				displayName: 'Owner Email',
				name: 'ownerEmail',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Only return envelopes owned by this email address',
			},
			{
				displayName: 'Owner Name',
				name: 'ownerName',
				type: 'string',
				default: '',
				description: 'Only return envelopes owned by this user',
			},
			{
				displayName: 'Search Text',
				name: 'searchText',
				type: 'string',
				default: '',
				description: 'Free text search across the envelopes in the folder',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: envelopeStatusOptions,
				default: [],
				description: 'Only return envelopes in one of these statuses',
			},
			{
				displayName: 'To Date',
				name: 'toDate',
				type: 'dateTime',
				default: '',
				description: 'Only return envelopes changed before this date',
			},
		],
	},
];
