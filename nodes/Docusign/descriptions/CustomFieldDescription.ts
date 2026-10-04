import type { INodeProperties } from 'n8n-workflow';

export const customFieldOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['customField'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Add a custom field to an envelope',
				action: 'Create a custom field',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a custom field from an envelope',
				action: 'Delete a custom field',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the custom fields of an envelope',
				action: 'Get many custom fields',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a custom field of an envelope',
				action: 'Update a custom field',
			},
		],
		default: 'getAll',
	},
];

export const customFieldFields: INodeProperties[] = [
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['customField'],
			},
		},
		description: 'ID of the envelope the custom fields belong to',
	},
	{
		displayName: 'Field Type',
		name: 'fieldType',
		type: 'options',
		options: [
			{
				name: 'Text',
				value: 'text',
				description: 'A free text field',
			},
			{
				name: 'List',
				value: 'list',
				description: 'A field restricted to a list of values',
			},
		],
		default: 'text',
		displayOptions: {
			show: {
				resource: ['customField'],
				operation: ['create', 'delete', 'update'],
			},
		},
		description: 'Kind of custom field',
	},
	{
		displayName: 'Field ID',
		name: 'fieldId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['customField'],
				operation: ['delete', 'update'],
			},
		},
		description: 'ID of the custom field',
	},
	{
		displayName: 'Name',
		name: 'fieldName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['customField'],
				operation: ['create'],
			},
		},
		description: 'Name of the custom field',
	},
	{
		displayName: 'Value',
		name: 'fieldValue',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['customField'],
				operation: ['create', 'update'],
			},
		},
		description: 'Value stored in the custom field',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['customField'],
				operation: ['create', 'update'],
			},
		},
		options: [
			{
				displayName: 'List Items',
				name: 'listItems',
				type: 'string',
				default: '',
				description: 'Comma-separated values the list field accepts',
			},
			{
				displayName: 'Name',
				name: 'fieldName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['update'],
					},
				},
				description: 'New name of the custom field',
			},
			{
				displayName: 'Required',
				name: 'required',
				type: 'boolean',
				default: false,
				description: 'Whether the sender must fill the field',
			},
			{
				displayName: 'Show to Recipients',
				name: 'show',
				type: 'boolean',
				default: false,
				description: 'Whether the field is visible to recipients',
			},
		],
	},
];
