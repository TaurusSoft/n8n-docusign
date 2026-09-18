import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { operationRegistry } from './actions';
import {
	accountFields,
	accountOperations,
	customFieldFields,
	customFieldOperations,
	documentFields,
	documentOperations,
	envelopeFields,
	envelopeOperations,
	envelopeViewFields,
	envelopeViewOperations,
	folderFields,
	folderOperations,
	recipientFields,
	recipientOperations,
	templateFields,
	templateOperations,
	userFields,
	userOperations,
} from './descriptions';
import type { DocusignContext } from './GenericFunctions';
import {
	docusignApiRequest,
	docusignApiRequestAllItems,
	getCredentialType,
	resolveDocusignContext,
	toDocusignError,
} from './GenericFunctions';

export class Docusign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Docusign',
		name: 'docusign',
		icon: {
			light: 'file:../../icons/docusign.svg',
			dark: 'file:../../icons/docusign.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send documents for signature and manage envelopes with Docusign eSignature',
		defaults: {
			name: 'Docusign',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'docusignOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
			{
				name: 'docusignJwtApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['jwt'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'OAuth2',
						value: 'oAuth2',
						description: 'Sign in interactively. Best for getting started.',
					},
					{
						name: 'JWT (Service Integration)',
						value: 'jwt',
						description:
							'Server-to-server authentication with an RSA key. Best for unattended workflows.',
					},
				],
				default: 'oAuth2',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
					},
					{
						name: 'Envelope',
						value: 'envelope',
					},
					{
						name: 'Envelope Custom Field',
						value: 'customField',
					},
					{
						name: 'Envelope Document',
						value: 'document',
					},
					{
						name: 'Envelope Recipient',
						value: 'recipient',
					},
					{
						name: 'Envelope View',
						value: 'envelopeView',
					},
					{
						name: 'Folder',
						value: 'folder',
					},
					{
						name: 'Template',
						value: 'template',
					},
					{
						name: 'User',
						value: 'user',
					},
				],
				default: 'envelope',
			},

			...accountOperations,
			...accountFields,
			...customFieldOperations,
			...customFieldFields,
			...documentOperations,
			...documentFields,
			...envelopeOperations,
			...envelopeFields,
			...envelopeViewOperations,
			...envelopeViewFields,
			...folderOperations,
			...folderFields,
			...recipientOperations,
			...recipientFields,
			...templateOperations,
			...templateFields,
			...userOperations,
			...userFields,
		],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const context = await loadOptionsContext(this);

				const templates = await docusignApiRequestAllItems(
					this,
					context,
					'envelopeTemplates',
					'GET',
					'/templates',
					undefined,
					{},
					200,
				);

				return templates
					.map((template) => ({
						name: (template.name as string) ?? (template.templateId as string),
						value: (template.templateId as string) ?? '',
					}))
					.filter((option) => option.value !== '')
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getFolders(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const context = await loadOptionsContext(this);

				const response = (await docusignApiRequest(
					this,
					context,
					'GET',
					'/folders',
				)) as IDataObject;

				const folders = (response?.folders as IDataObject[] | undefined) ?? [];

				return folders
					.map((folder) => ({
						name: (folder.name as string) ?? (folder.folderId as string),
						value: (folder.folderId as string) ?? '',
					}))
					.filter((option) => option.value !== '')
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const context = await loadOptionsContext(this);

				const users = await docusignApiRequestAllItems(
					this,
					context,
					'users',
					'GET',
					'/users',
					undefined,
					{},
					200,
				);

				return users
					.map((user) => ({
						name: `${(user.userName as string) ?? 'unnamed'} (${(user.email as string) ?? ''})`,
						value: (user.userId as string) ?? '',
					}))
					.filter((option) => option.value !== '')
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const authentication = this.getNodeParameter('authentication', 0) as string;

		const handler = operationRegistry[resource]?.[operation];

		if (handler === undefined) {
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}".`,
			);
		}

		let credentialType: string;
		try {
			credentialType = getCredentialType(authentication);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				error instanceof Error ? error.message : String(error),
			);
		}

		// Resolved lazily and reused, so one execution triggers at most one
		// account lookup no matter how many items it processes.
		let context: DocusignContext | undefined;
		const contextFor = async (): Promise<DocusignContext> => {
			context ??= await resolveDocusignContext(this, credentialType);

			return context;
		};

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				returnData.push(...(await handler(this, itemIndex, await contextFor())));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				throw toDocusignError(this, error);
			}
		}

		return [returnData];
	}
}

/** Load-options calls have no item index, so the parameter is read without one. */
async function loadOptionsContext(ctx: ILoadOptionsFunctions): Promise<DocusignContext> {
	const authentication = ctx.getNodeParameter('authentication', 'oAuth2') as string;

	return await resolveDocusignContext(ctx, getCredentialType(authentication));
}
