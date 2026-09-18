import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IHookFunctions,
	INodeCredentialTestResult,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { DocusignContext, FullHttpResponse } from '../Docusign/GenericFunctions';
import {
	docusignApiRequest,
	getCredentialType,
	resolveDocusignContext,
	responseToBinary,
} from '../Docusign/GenericFunctions';
import {
	buildConnectConfigurations,
	extractEnvelopeId,
	extractEventName,
	findConfigurationsForUrl,
	matchesEvents,
	verifyHmacSignature,
} from './helpers';

/** Static data key holding the IDs of the configurations this node created. */
const CONNECT_IDS_KEY = 'docusignConnectIds';

export class DocusignTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Docusign Trigger',
		name: 'docusignTrigger',
		icon: {
			light: 'file:../../icons/docusign.svg',
			dark: 'file:../../icons/docusign.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].length ? $parameter["events"].join(", ") : "all events"}}',
		description: 'Starts a workflow when Docusign Connect sends a webhook',
		defaults: {
			name: 'Docusign Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'docusignConnectApi',
				required: true,
				testedBy: 'docusignConnectApiTest',
				displayOptions: {
					show: {
						verifyHmac: [true],
					},
				},
			},
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
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
				rawBody: true,
			},
		],
		properties: [
			{
				displayName: 'Configuration Mode',
				name: 'configurationMode',
				type: 'options',
				options: [
					{
						name: 'Manual',
						value: 'manual',
						description: 'You create the Connect configuration in Docusign yourself',
					},
					{
						name: 'Automatic',
						value: 'automatic',
						description:
							'Let n8n create and remove the Connect configuration through the API. Requires an account administrator.',
					},
				],
				default: 'manual',
				description: 'Who manages the Docusign Connect configuration behind this webhook',
			},
			{
				displayName:
					'Create a Connect configuration in Docusign under Settings &rarr; Connect, point it at the webhook URL above and choose <b>JSON (restv2.1)</b> as the data format. Switch to the automatic mode to have n8n do this for you, which needs an account administrator credential.',
				name: 'manualSetupNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						configurationMode: ['manual'],
					},
				},
			},
			{
				displayName:
					'Connect endpoints require an account administrator. Pick a credential under Authentication below, otherwise activating this workflow will fail.',
				name: 'automaticSetupNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						configurationMode: ['automatic'],
					},
				},
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: [
					{
						name: 'Envelope Completed',
						value: 'envelope-completed',
						description: 'All recipients have finished signing',
					},
					{
						name: 'Envelope Declined',
						value: 'envelope-declined',
						description: 'A recipient declined to sign',
					},
					{
						name: 'Envelope Delivered',
						value: 'envelope-delivered',
						description: 'A recipient opened the envelope',
					},
					{
						name: 'Envelope Sent',
						value: 'envelope-sent',
						description: 'The envelope was sent to its recipients',
					},
					{
						name: 'Envelope Voided',
						value: 'envelope-voided',
						description: 'The envelope was voided by the sender',
					},
					{
						name: 'Recipient Authentication Failed',
						value: 'recipient-authenticationfailed',
						description: 'A recipient failed the configured authentication',
					},
					{
						name: 'Recipient Completed',
						value: 'recipient-completed',
						description: 'A single recipient finished signing',
					},
					{
						name: 'Recipient Declined',
						value: 'recipient-declined',
						description: 'A single recipient declined to sign',
					},
					{
						name: 'Recipient Delivered',
						value: 'recipient-delivered',
						description: 'A single recipient opened the envelope',
					},
					{
						name: 'Recipient Sent',
						value: 'recipient-sent',
						description: 'The envelope was sent to a single recipient',
					},
				],
				default: ['envelope-completed'],
				description:
					'Events this workflow reacts to. In manual mode Docusign still delivers everything the configuration subscribes to, and anything not selected here is acknowledged and ignored. Leave empty to accept every event.',
			},
			{
				displayName: 'Verify HMAC Signature',
				name: 'verifyHmac',
				type: 'boolean',
				default: true,
				description:
					'Whether to reject requests whose HMAC signature does not match. Keep this on: without it anyone who learns the webhook URL can start this workflow.',
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'None',
						value: 'none',
						description: 'No API access. Only works in manual mode without document download.',
					},
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
					{
						name: 'JWT (Service Integration)',
						value: 'jwt',
					},
				],
				default: 'none',
				description:
					'Credential used for Docusign API access, needed for the automatic configuration mode and for downloading documents',
			},
			{
				displayName: 'Download Documents',
				name: 'downloadDocuments',
				type: 'boolean',
				default: false,
				description:
					'Whether to fetch the signed documents as a combined PDF and attach them to the output item. Needs a credential under Authentication.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Raw Body',
						name: 'includeRawBody',
						type: 'boolean',
						default: false,
						description:
							'Whether to add the unparsed request body as a string, e.g. to re-verify the signature downstream',
					},
					{
						displayName: 'Put Documents in Field',
						name: 'binaryPropertyName',
						type: 'string',
						default: 'data',
						description: 'Name of the binary field downloaded documents are written to',
					},
					{
						displayName: 'Configuration Name',
						name: 'configurationName',
						type: 'string',
						default: '',
						description:
							'Name for the Connect configuration created in automatic mode. Defaults to a name derived from the workflow.',
					},
				],
			},
		],
	};

	methods = {
		credentialTest: {
			async docusignConnectApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const secret = ((credential.data?.hmacSecret as string) ?? '').trim();

				if (secret === '') {
					return {
						status: 'Error',
						message: 'No HMAC secret was entered.',
					};
				}

				// There is no Docusign endpoint that can confirm a Connect HMAC
				// secret, so this checks what can be checked locally and says so.
				if (secret.length < 8) {
					return {
						status: 'Error',
						message:
							'This HMAC secret looks too short. Copy the full secret generated in Docusign under Settings → Connect.',
					};
				}

				return {
					status: 'OK',
					message:
						'Secret stored. It can only be confirmed against a real Connect webhook, so send a test event from Docusign to be sure.',
				};
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const configurationMode = this.getNodeParameter('configurationMode') as string;

				// Nothing is registered through n8n in manual mode, so there is
				// nothing to look for either.
				if (configurationMode !== 'automatic') {
					return true;
				}

				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const context = await triggerApiContext(this);

				const response = (await docusignApiRequest(
					this,
					context,
					'GET',
					'/connect',
				)) as IDataObject;

				const configurations = (response?.configurations as IDataObject[] | undefined) ?? [];
				const matching = findConfigurationsForUrl(configurations, webhookUrl);

				if (matching.length === 0) {
					return false;
				}

				this.getWorkflowStaticData('node')[CONNECT_IDS_KEY] = matching;

				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const configurationMode = this.getNodeParameter('configurationMode') as string;

				if (configurationMode !== 'automatic') {
					return true;
				}

				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const verifyHmac = this.getNodeParameter('verifyHmac') as boolean;
				const options = this.getNodeParameter('options', {}) as { configurationName?: string };

				const name =
					options.configurationName !== undefined && options.configurationName !== ''
						? options.configurationName
						: `n8n - ${this.getWorkflow().name ?? 'workflow'}`;

				const payloads = buildConnectConfigurations(webhookUrl, events, name, verifyHmac);

				if (payloads.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Select at least one event before activating the workflow in automatic mode.',
					);
				}

				const context = await triggerApiContext(this);
				const createdIds: string[] = [];

				for (const payload of payloads) {
					const response = (await docusignApiRequest(
						this,
						context,
						'POST',
						'/connect',
						payload,
					)) as IDataObject;

					const connectId = response?.connectId;
					if (typeof connectId === 'string' && connectId !== '') {
						createdIds.push(connectId);
					}
				}

				this.getWorkflowStaticData('node')[CONNECT_IDS_KEY] = createdIds;

				return createdIds.length > 0;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const configurationMode = this.getNodeParameter('configurationMode') as string;
				const staticData = this.getWorkflowStaticData('node');
				const connectIds = (staticData[CONNECT_IDS_KEY] as string[] | undefined) ?? [];

				if (configurationMode !== 'automatic' || connectIds.length === 0) {
					delete staticData[CONNECT_IDS_KEY];

					return true;
				}

				const context = await triggerApiContext(this);
				let allRemoved = true;

				for (const connectId of connectIds) {
					try {
						await docusignApiRequest(this, context, 'DELETE', `/connect/${connectId}`);
					} catch {
						// A configuration deleted in the Docusign UI meanwhile is fine;
						// anything else is reported so the user can clean up manually.
						allRemoved = false;
					}
				}

				delete staticData[CONNECT_IDS_KEY];

				return allRemoved;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData();
		const body = this.getBodyData();

		const verifyHmac = this.getNodeParameter('verifyHmac') as boolean;
		const events = this.getNodeParameter('events') as string[];
		const downloadDocuments = this.getNodeParameter('downloadDocuments') as boolean;
		const options = this.getNodeParameter('options', {}) as {
			includeRawBody?: boolean;
			binaryPropertyName?: string;
		};

		const rawBody = (request as { rawBody?: Buffer }).rawBody;

		if (verifyHmac) {
			if (rawBody === undefined) {
				throw new NodeOperationError(
					this.getNode(),
					'The raw request body is not available, so the HMAC signature cannot be verified.',
				);
			}

			const credentials = await this.getCredentials('docusignConnectApi');
			const secret = ((credentials.hmacSecret as string) ?? '').trim();

			if (secret === '') {
				throw new NodeOperationError(
					this.getNode(),
					'HMAC verification is enabled but the credential contains no secret.',
				);
			}

			if (!verifyHmacSignature(rawBody, secret, headers)) {
				// No workflowData: the run never starts and the payload is dropped.
				return {
					webhookResponse: { status: 'unauthorized' },
					workflowData: undefined,
				};
			}
		}

		const eventName = extractEventName(body);

		if (!matchesEvents(eventName, events)) {
			// Acknowledged so Docusign stops retrying, but no execution starts.
			return { workflowData: undefined };
		}

		const json: IDataObject = { ...body };

		if (options.includeRawBody === true) {
			json.rawBody = rawBody !== undefined ? rawBody.toString('utf8') : undefined;
		}

		if (!downloadDocuments) {
			return { workflowData: [[{ json }]] };
		}

		const envelopeId = extractEnvelopeId(body);

		if (envelopeId === undefined) {
			throw new NodeOperationError(
				this.getNode(),
				'The webhook payload contains no envelope ID, so the documents cannot be downloaded.',
			);
		}

		const context = await triggerApiContext(this);

		const response = (await docusignApiRequest(
			this,
			context,
			'GET',
			`/envelopes/${envelopeId}/documents/combined`,
			undefined,
			{},
			{ encoding: 'arraybuffer', returnFullResponse: true },
		)) as FullHttpResponse;

		const item = await responseToBinary(
			this,
			response,
			options.binaryPropertyName ?? 'data',
			`${envelopeId}.pdf`,
			json,
		);

		return { workflowData: [[item]] };
	}
}

/** Resolves the API context for the paths of this trigger that call Docusign. */
async function triggerApiContext(
	ctx: IHookFunctions | IWebhookFunctions,
): Promise<DocusignContext> {
	const authentication = ctx.getNodeParameter('authentication', 'none') as string;

	let credentialType: string;
	try {
		credentialType = getCredentialType(authentication);
	} catch (error) {
		throw new NodeOperationError(
			ctx.getNode(),
			error instanceof Error ? error.message : String(error),
		);
	}

	return await resolveDocusignContext(ctx, credentialType);
}
