import type { INodeProperties } from 'n8n-workflow';

import { signerFields } from './SharedFields';

export const recipientOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['recipient'],
			},
		},
		options: [
			{
				name: 'Add',
				value: 'add',
				description: 'Add recipients to an envelope',
				action: 'Add a recipient',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Remove a recipient from an envelope',
				action: 'Delete a recipient',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the recipients of an envelope',
				action: 'Get many recipients',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a recipient of an envelope',
				action: 'Update a recipient',
			},
		],
		default: 'getAll',
	},
];

export const recipientFields: INodeProperties[] = [
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['recipient'],
			},
		},
		description: 'ID of the envelope the recipients belong to',
	},

	// ----------------------------------
	//         recipient: add
	// ----------------------------------
	{
		displayName: 'Recipients',
		name: 'signersUi',
		placeholder: 'Add Recipient',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		displayOptions: {
			show: {
				resource: ['recipient'],
				operation: ['add'],
			},
		},
		options: [
			{
				displayName: 'Recipient',
				name: 'signer',
				values: signerFields,
			},
		],
		description: 'Recipients to add to the envelope',
	},

	// ----------------------------------
	//    recipient: update / delete
	// ----------------------------------
	{
		displayName: 'Recipient ID',
		name: 'recipientId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['recipient'],
				operation: ['delete', 'update'],
			},
		},
		description: 'ID of the recipient within the envelope',
	},
	{
		displayName: 'Recipient Type',
		name: 'recipientType',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['recipient'],
				operation: ['update'],
			},
		},
		options: [
			{ name: 'Agent', value: 'agent' },
			{ name: 'Carbon Copy', value: 'carbonCopy' },
			{ name: 'Certified Delivery', value: 'certifiedDelivery' },
			{ name: 'Editor', value: 'editor' },
			{ name: 'In Person Signer', value: 'inPersonSigner' },
			{ name: 'Intermediary', value: 'intermediary' },
			{ name: 'Notary', value: 'notary' },
			{ name: 'Seal', value: 'seal' },
			{ name: 'Signer', value: 'signer' },
			{ name: 'Witness', value: 'witness' },
		],
		default: 'signer',
		description:
			'Role the recipient has in the envelope. Docusign keeps one list per role and identifies a recipient by the list it is in, so picking the wrong one updates an unrelated recipient. Get Many returns the matching value as recipientType.',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['recipient'],
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
				description: 'New email address of the recipient',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New name of the recipient',
			},
			{
				displayName: 'Note',
				name: 'note',
				type: 'string',
				default: '',
				description: 'Private note shown only to this recipient',
			},
			{
				displayName: 'Routing Order',
				name: 'routingOrder',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 1,
				description: 'New position of the recipient in the signing order',
			},
		],
	},

	// ----------------------------------
	//        recipient: options
	// ----------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['recipient'],
				operation: ['add', 'update'],
			},
		},
		options: [
			{
				displayName: 'Resend Envelope',
				name: 'resendEnvelope',
				type: 'boolean',
				default: false,
				description: 'Whether the notification email is sent again to the affected recipients',
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
				resource: ['recipient'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Include Anchor Tab Locations',
				name: 'includeAnchorTabLocations',
				type: 'boolean',
				default: false,
				description: 'Whether to include the resolved positions of anchored tabs',
			},
			{
				displayName: 'Include Tabs',
				name: 'includeTabs',
				type: 'boolean',
				default: false,
				description: 'Whether to include the tabs assigned to each recipient',
			},
		],
	},
];
