import type { INodeProperties } from 'n8n-workflow';

/**
 * Recipient sub-fields, reused by `Envelope: Create` and `Recipient: Add`.
 *
 * Kept as plain values rather than a factory so the n8n lint rules can still
 * analyse the resulting property trees statically.
 */
export const signerFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Full name of the signer, as it should appear on the document',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		required: true,
		description: 'Email address the signing request is sent to',
	},
	{
		displayName: 'Recipient ID',
		name: 'recipientId',
		type: 'string',
		default: '',
		description:
			'Unique ID for this recipient within the envelope. Leave empty to number recipients automatically.',
	},
	{
		displayName: 'Routing Order',
		name: 'routingOrder',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 1,
		description:
			'Order in which recipients receive the envelope. Recipients sharing a routing order are notified at the same time.',
	},
	{
		displayName: 'Client User ID',
		name: 'clientUserId',
		type: 'string',
		default: '',
		description:
			'Set this to turn the recipient into an embedded (captive) signer who signs through a generated URL instead of receiving an email',
	},
	{
		displayName: 'Signature Placement',
		name: 'signaturePlacement',
		type: 'options',
		options: [
			{
				name: 'None',
				value: 'none',
				description: 'Do not add a signature tab, e.g. when the document already carries tabs',
			},
			{
				name: 'Anchor Text',
				value: 'anchor',
				description: 'Place the signature next to a piece of text found in the document',
			},
			{
				name: 'Fixed Position',
				value: 'position',
				description: 'Place the signature at exact coordinates on a page',
			},
		],
		default: 'anchor',
		description: 'Where to place the signature field for this recipient',
	},
	{
		displayName: 'Anchor Text',
		name: 'anchorString',
		type: 'string',
		default: '/sig1/',
		required: true,
		displayOptions: {
			show: {
				signaturePlacement: ['anchor'],
			},
		},
		description:
			'Text in the document the signature tab is anchored to. Docusign places the tab at every occurrence.',
	},
	{
		displayName: 'Anchor X Offset',
		name: 'anchorXOffset',
		type: 'number',
		default: 0,
		displayOptions: {
			show: {
				signaturePlacement: ['anchor'],
			},
		},
		description: 'Horizontal offset from the anchor text, in pixels',
	},
	{
		displayName: 'Anchor Y Offset',
		name: 'anchorYOffset',
		type: 'number',
		default: 0,
		displayOptions: {
			show: {
				signaturePlacement: ['anchor'],
			},
		},
		description: 'Vertical offset from the anchor text, in pixels',
	},
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: '1',
		displayOptions: {
			show: {
				signaturePlacement: ['position'],
			},
		},
		description: 'ID of the document the signature tab is placed on',
	},
	{
		displayName: 'Page Number',
		name: 'pageNumber',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 1,
		displayOptions: {
			show: {
				signaturePlacement: ['position'],
			},
		},
		description: 'Page the signature tab is placed on',
	},
	{
		displayName: 'X Position',
		name: 'xPosition',
		type: 'number',
		default: 100,
		displayOptions: {
			show: {
				signaturePlacement: ['position'],
			},
		},
		description: 'Horizontal position of the signature tab, in pixels from the left edge',
	},
	{
		displayName: 'Y Position',
		name: 'yPosition',
		type: 'number',
		default: 100,
		displayOptions: {
			show: {
				signaturePlacement: ['position'],
			},
		},
		description: 'Vertical position of the signature tab, in pixels from the top edge',
	},
];

/** Role assignment sub-fields for `Envelope: Create` from a template. */
export const templateRoleFields: INodeProperties[] = [
	{
		displayName: 'Role Name',
		name: 'roleName',
		type: 'string',
		default: '',
		required: true,
		description: 'Name of the role defined in the template, e.g. "Signer 1"',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Full name of the person filling this role',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		required: true,
		description: 'Email address of the person filling this role',
	},
	{
		displayName: 'Routing Order',
		name: 'routingOrder',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 1,
		description: 'Order in which this role receives the envelope',
	},
	{
		displayName: 'Client User ID',
		name: 'clientUserId',
		type: 'string',
		default: '',
		description: 'Set this to turn the role into an embedded (captive) signer',
	},
];

export const returnAllField: INodeProperties = {
	displayName: 'Return All',
	name: 'returnAll',
	type: 'boolean',
	default: false,
	description: 'Whether to return all results or only up to a given limit',
};

export const limitField: INodeProperties = {
	displayName: 'Limit',
	name: 'limit',
	type: 'number',
	typeOptions: {
		minValue: 1,
	},
	default: 50,
	description: 'Max number of results to return',
};

/** Envelope status values, shared by filters and the create operation. */
export const envelopeStatusOptions = [
	{ name: 'Completed', value: 'completed' },
	{ name: 'Created (Draft)', value: 'created' },
	{ name: 'Declined', value: 'declined' },
	{ name: 'Delivered', value: 'delivered' },
	{ name: 'Sent', value: 'sent' },
	{ name: 'Signed', value: 'signed' },
	{ name: 'Voided', value: 'voided' },
];
