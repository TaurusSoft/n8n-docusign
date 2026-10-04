import type { INodeProperties } from 'n8n-workflow';

import {
	envelopeStatusOptions,
	limitField,
	returnAllField,
	signerFields,
	templateRoleFields,
} from './SharedFields';

export const envelopeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create an envelope, either as a draft or sent straight away',
				action: 'Create an envelope',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single envelope',
				action: 'Get an envelope',
			},
			{
				name: 'Get Audit Events',
				value: 'getAuditEvents',
				description: 'Get the audit trail of an envelope',
				action: 'Get audit events of an envelope',
			},
			{
				name: 'Get Form Data',
				value: 'getFormData',
				description: 'Get the data recipients entered into the form fields of an envelope',
				action: 'Get form data of an envelope',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many envelopes',
				action: 'Get many envelopes',
			},
			{
				name: 'Resend',
				value: 'resend',
				description: 'Resend the notification email to pending recipients',
				action: 'Resend an envelope',
			},
			{
				name: 'Send',
				value: 'send',
				description: 'Send a draft envelope to its recipients',
				action: 'Send an envelope',
			},
			{
				name: 'Void',
				value: 'void',
				description: 'Void an envelope so it can no longer be signed',
				action: 'Void an envelope',
			},
		],
		default: 'create',
	},
];

export const envelopeFields: INodeProperties[] = [
	// ----------------------------------
	//          envelope: create
	// ----------------------------------
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
			},
		},
		options: [
			{
				name: 'Documents',
				value: 'documents',
				description: 'Build the envelope from binary documents on the input item',
			},
			{
				name: 'Template',
				value: 'template',
				description: 'Build the envelope from a Docusign template',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'Provide a complete envelope definition as JSON',
			},
		],
		default: 'documents',
		description: 'How the envelope contents are provided',
	},
	{
		displayName: 'Input Binary Field(s)',
		name: 'binaryPropertyNames',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['documents'],
			},
		},
		description:
			'Comma-separated names of the binary fields holding the documents to be signed, in the order they should appear',
	},
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
				resource: ['envelope'],
				operation: ['create'],
				source: ['template'],
			},
		},
		description:
			'Template to create the envelope from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Envelope Definition (JSON)',
		name: 'envelopeDefinitionJson',
		type: 'json',
		default: '{\n  "emailSubject": "Please sign",\n  "status": "sent"\n}',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['json'],
			},
		},
		description:
			'The full envelope definition as accepted by the Docusign API. Use this for features the other fields do not cover.',
	},
	{
		displayName: 'Email Subject',
		name: 'emailSubject',
		type: 'string',
		default: 'Please sign this document',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['documents', 'template'],
			},
		},
		description: 'Subject line of the email recipients receive',
	},
	{
		displayName: 'Status',
		name: 'envelopeStatus',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['documents', 'template'],
			},
		},
		options: [
			{
				name: 'Sent',
				value: 'sent',
				description: 'Send the envelope to its recipients immediately',
			},
			{
				name: 'Created (Draft)',
				value: 'created',
				description: 'Keep the envelope as a draft so it can be sent later',
			},
		],
		default: 'sent',
		description: 'Whether the envelope is sent right away or saved as a draft',
	},
	{
		displayName: 'Signers',
		name: 'signersUi',
		placeholder: 'Add Signer',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['documents'],
			},
		},
		options: [
			{
				displayName: 'Signer',
				name: 'signer',
				values: signerFields,
			},
		],
		description: 'People who have to sign the documents',
	},
	{
		displayName: 'Template Roles',
		name: 'templateRolesUi',
		placeholder: 'Add Role',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['template'],
			},
		},
		options: [
			{
				displayName: 'Role',
				name: 'role',
				values: templateRoleFields,
			},
		],
		description: 'People filling the roles defined in the template',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['create'],
				source: ['documents', 'template'],
			},
		},
		options: [
			{
				displayName: 'Allow Reassign',
				name: 'allowReassign',
				type: 'boolean',
				default: true,
				description: 'Whether recipients may reassign signing to someone else',
			},
			{
				displayName: 'Brand ID',
				name: 'brandId',
				type: 'string',
				default: '',
				description: 'ID of the Docusign brand applied to the signing experience',
			},
			{
				displayName: 'Email Message',
				name: 'emailBlurb',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'Body text of the email recipients receive',
			},
			{
				displayName: 'Enable Wet Sign',
				name: 'enableWetSign',
				type: 'boolean',
				default: false,
				description: 'Whether recipients may print, sign on paper and upload the document',
			},
			{
				displayName: 'Envelope ID Stamping',
				name: 'envelopeIdStamping',
				type: 'boolean',
				default: true,
				description: 'Whether the envelope ID is stamped onto the documents',
			},
			{
				displayName: 'Expire After (Days)',
				name: 'expireAfter',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 30,
				description:
					'Number of days after which an unsigned envelope expires. Setting this or a reminder takes the envelope off the account notification defaults, so set both if the envelope needs both.',
			},
			{
				displayName: 'Reminder Delay (Days)',
				name: 'reminderDelay',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 3,
				description:
					'Days to wait before the first reminder is sent. Reminders take the envelope off the account notification defaults, including its expiration policy: add Expire After to keep one.',
			},
			{
				displayName: 'Reminder Frequency (Days)',
				name: 'reminderFrequency',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 3,
				description:
					'Days between reminders. Reminders take the envelope off the account notification defaults, including its expiration policy: add Expire After to keep one.',
			},
		],
	},

	// ----------------------------------
	//        envelope: by ID
	// ----------------------------------
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['get', 'getAuditEvents', 'getFormData', 'resend', 'send', 'void'],
			},
		},
		description: 'ID of the envelope to operate on',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['envelope'],
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
					{ name: 'Extensions', value: 'extensions' },
					{ name: 'Folders', value: 'folders' },
					{ name: 'Payment Tabs', value: 'payment_tabs' },
					{ name: 'Powerform', value: 'powerform' },
					{ name: 'Recipients', value: 'recipients' },
					{ name: 'Tabs', value: 'tabs' },
				],
				default: [],
				description: 'Additional envelope details to include in the response',
			},
		],
	},
	{
		displayName: 'Void Reason',
		name: 'voidReason',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['void'],
			},
		},
		description: 'Reason the envelope is voided. Docusign shows this to the recipients.',
	},

	// ----------------------------------
	//         envelope: getAll
	// ----------------------------------
	{
		...returnAllField,
		displayOptions: {
			show: {
				resource: ['envelope'],
				operation: ['getAll'],
			},
		},
	},
	{
		...limitField,
		displayOptions: {
			show: {
				resource: ['envelope'],
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
				resource: ['envelope'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Envelope IDs',
				name: 'envelopeIds',
				type: 'string',
				default: '',
				description: 'Comma-separated list of envelope IDs to restrict the result to',
			},
			{
				displayName: 'From Date',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				description:
					'Only return envelopes changed after this date. Defaults to 30 days ago, because Docusign requires a starting point.',
			},
			{
				displayName: 'Search Text',
				name: 'searchText',
				type: 'string',
				default: '',
				description: 'Free text search across recipient names, emails and envelope subjects',
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
			{
				displayName: 'User Email',
				name: 'userEmail',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Only return envelopes involving this email address',
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
				resource: ['envelope'],
				operation: ['getAll'],
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
					{ name: 'Folders', value: 'folders' },
					{ name: 'Recipients', value: 'recipients' },
				],
				default: [],
				description: 'Additional envelope details to include in the response',
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'options',
				options: [
					{ name: 'Completed', value: 'completed' },
					{ name: 'Created', value: 'created' },
					{ name: 'Last Modified', value: 'last_modified' },
					{ name: 'Sent', value: 'sent' },
					{ name: 'Status', value: 'status' },
					{ name: 'Subject', value: 'subject' },
				],
				default: 'last_modified',
				description: 'Field the results are sorted by',
			},
		],
	},
];
