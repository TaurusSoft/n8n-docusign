import type { INodeProperties } from 'n8n-workflow';

export const documentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['document'],
			},
		},
		options: [
			{
				name: 'Add',
				value: 'add',
				description: 'Add documents to an existing envelope',
				action: 'Add a document',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete documents from an envelope',
				action: 'Delete a document',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download a document as binary data',
				action: 'Download a document',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the list of documents in an envelope',
				action: 'Get many documents',
			},
		],
		default: 'download',
	},
];

export const documentFields: INodeProperties[] = [
	{
		displayName: 'Envelope ID',
		name: 'envelopeId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
			},
		},
		description: 'ID of the envelope the documents belong to',
	},

	// ----------------------------------
	//        document: download
	// ----------------------------------
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: 'combined',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['download'],
			},
		},
		description:
			'ID of the document to download. Use "combined" for all documents in one PDF, "archive" for a ZIP, or "certificate" for the certificate of completion.',
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['download'],
			},
		},
		description: 'Name of the binary field the downloaded document is written to',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['download'],
			},
		},
		options: [
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description:
					'Name for the downloaded file. Defaults to the name Docusign reports in the response.',
			},
			{
				displayName: 'Include Certificate',
				name: 'certificate',
				type: 'boolean',
				default: false,
				description:
					'Whether to append the certificate of completion when downloading the combined document',
			},
			{
				displayName: 'Show Changes',
				name: 'showChanges',
				type: 'boolean',
				default: false,
				description: 'Whether field values changed after sending are highlighted in the PDF',
			},
			{
				displayName: 'Watermark',
				name: 'watermark',
				type: 'boolean',
				default: true,
				description: 'Whether the account watermark is applied to the document',
			},
		],
	},

	// ----------------------------------
	//        document: add
	// ----------------------------------
	{
		displayName: 'Input Binary Field(s)',
		name: 'binaryPropertyNames',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['add'],
			},
		},
		description: 'Comma-separated names of the binary fields holding the documents to add',
	},
	{
		displayName: 'First Document ID',
		name: 'startDocumentId',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 1,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['add'],
			},
		},
		description:
			'ID assigned to the first added document, incremented for each following one. Reusing an existing ID replaces that document.',
	},

	// ----------------------------------
	//        document: delete
	// ----------------------------------
	{
		displayName: 'Document IDs',
		name: 'documentIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['delete'],
			},
		},
		description: 'Comma-separated IDs of the documents to delete',
	},

	// ----------------------------------
	//        document: getAll
	// ----------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['document'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Include Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: false,
				description: 'Whether to include document metadata such as the authoritative copy flag',
			},
			{
				displayName: 'Include Tabs',
				name: 'includeTabs',
				type: 'boolean',
				default: false,
				description: 'Whether to include the tabs placed on each document',
			},
		],
	},
];
