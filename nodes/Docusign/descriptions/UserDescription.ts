import type { INodeProperties } from 'n8n-workflow';

import { limitField, returnAllField } from './SharedFields';

export const userOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['user'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Invite a new user to the account',
				action: 'Create a user',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Close a user account',
				action: 'Delete a user',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single user',
				action: 'Get a user',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many users of the account',
				action: 'Get many users',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a user of the account',
				action: 'Update a user',
			},
		],
		default: 'getAll',
	},
];

export const userFields: INodeProperties[] = [
	{
		displayName: 'User Name or ID',
		name: 'userId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getUsers',
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['delete', 'get', 'update'],
			},
		},
		description:
			'User to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// ----------------------------------
	//           user: create
	// ----------------------------------
	{
		displayName: 'Name',
		name: 'userName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		description: 'Full name of the new user',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		description: 'Email address of the new user',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['create'],
			},
		},
		options: [
			{
				displayName: 'Activation Access Code',
				name: 'activationAccessCode',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description: 'Access code the new user must enter to activate the account',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				description: 'First name of the new user',
			},
			{
				displayName: 'Group IDs',
				name: 'groupIds',
				type: 'string',
				default: '',
				description: 'Comma-separated IDs of the groups the user is added to',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				description: 'Last name of the new user',
			},
			{
				displayName: 'Permission Profile ID',
				name: 'permissionProfileId',
				type: 'string',
				default: '',
				description: 'ID of the permission profile assigned to the user',
			},
		],
	},

	// ----------------------------------
	//           user: update
	// ----------------------------------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'New email address of the user',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				description: 'New first name of the user',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				description: 'New last name of the user',
			},
			{
				displayName: 'Name',
				name: 'userName',
				type: 'string',
				default: '',
				description: 'New full name of the user',
			},
			{
				displayName: 'Permission Profile ID',
				name: 'permissionProfileId',
				type: 'string',
				default: '',
				description: 'ID of the permission profile assigned to the user',
			},
			{
				displayName: 'Status',
				name: 'userStatus',
				type: 'options',
				options: [
					{ name: 'Active', value: 'Active' },
					{ name: 'Closed', value: 'Closed' },
					{ name: 'Disabled', value: 'Disabled' },
				],
				default: 'Active',
				description: 'New status of the user',
			},
		],
	},

	// ----------------------------------
	//           user: getAll
	// ----------------------------------
	{
		...returnAllField,
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['getAll'],
			},
		},
	},
	{
		...limitField,
		displayOptions: {
			show: {
				resource: ['user'],
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
				resource: ['user'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Only return the user with this email address',
			},
			{
				displayName: 'Name Contains',
				name: 'userNameSubstring',
				type: 'string',
				default: '',
				description: 'Only return users whose name contains this text',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: [
					{ name: 'ActivationRequired', value: 'ActivationRequired' },
					{ name: 'ActivationSent', value: 'ActivationSent' },
					{ name: 'Active', value: 'Active' },
					{ name: 'Closed', value: 'Closed' },
					{ name: 'Disabled', value: 'Disabled' },
				],
				default: [],
				description: 'Only return users in one of these statuses',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['get', 'getAll'],
			},
		},
		options: [
			{
				displayName: 'Additional Info',
				name: 'additionalInfo',
				type: 'boolean',
				default: false,
				description: 'Whether to include the full user settings in the response',
			},
		],
	},
];
