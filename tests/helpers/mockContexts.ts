import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	IWebhookFunctions,
} from 'n8n-workflow';
import { vi } from 'vitest';

import { ACCOUNT_BASE_URL, ACCOUNT_ID } from './msw';

export interface RecordedRequest {
	credentialType: string;
	options: IHttpRequestOptions;
}

export type RequestHandler = (
	credentialType: string,
	options: IHttpRequestOptions,
) => Promise<unknown>;

export interface BinaryFixture {
	buffer: Buffer;
	meta?: Partial<IBinaryData>;
}

export interface MockContextOptions {
	/** Flat parameter map; a function receives the item index. */
	parameters?: Record<string, unknown | ((itemIndex: number) => unknown)>;
	credentials?: Record<string, IDataObject>;
	items?: INodeExecutionData[];
	binary?: Record<string, BinaryFixture>;
	continueOnFail?: boolean;
	/** Queue of responses returned in order by the request helper. */
	responses?: unknown[];
	/** Full control over the request helper; wins over `responses`. */
	requestHandler?: RequestHandler;
	headers?: Record<string, string | string[] | undefined>;
	body?: IDataObject;
	rawBody?: Buffer;
	webhookUrl?: string;
	workflowName?: string;
	staticData?: IDataObject;
}

export interface MockContext {
	requests: RecordedRequest[];
	staticData: IDataObject;
	node: INode;
}

/** What a node wrote straight onto the HTTP response, bypassing `webhookResponse`. */
export interface SentResponse {
	statusCode?: number;
	body?: unknown;
}

const DEFAULT_CREDENTIALS: Record<string, IDataObject> = {
	docusignOAuth2Api: {
		environment: 'demo',
		accountId: ACCOUNT_ID,
		accountBaseUrl: ACCOUNT_BASE_URL,
	},
	docusignJwtApi: {
		environment: 'demo',
		accountId: ACCOUNT_ID,
		accountBaseUrl: ACCOUNT_BASE_URL,
	},
	docusignConnectApi: {
		hmacSecret: 'test-secret',
	},
};

function buildNode(): INode {
	return {
		id: 'node-1',
		name: 'Docusign',
		type: 'docusign',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
}

function resolveParameter(
	options: MockContextOptions,
	name: string,
	itemIndex: number,
	fallback?: unknown,
): unknown {
	const parameters = options.parameters ?? {};

	if (!(name in parameters)) {
		if (fallback !== undefined) {
			return fallback;
		}

		throw new Error(`Test setup is missing the node parameter "${name}"`);
	}

	const value = parameters[name];

	return typeof value === 'function' ? (value as (index: number) => unknown)(itemIndex) : value;
}

function buildRequestHelper(options: MockContextOptions, recorded: RecordedRequest[]) {
	const queue = [...(options.responses ?? [])];

	return vi.fn(async function (
		this: unknown,
		credentialType: string,
		requestOptions: IHttpRequestOptions,
	) {
		recorded.push({ credentialType, options: requestOptions });

		if (options.requestHandler !== undefined) {
			return await options.requestHandler(credentialType, requestOptions);
		}

		if (queue.length === 0) {
			throw new Error(
				`No mocked response left for ${requestOptions.method ?? 'GET'} ${requestOptions.url}`,
			);
		}

		const next = queue.shift();

		if (next instanceof Error) {
			throw next;
		}

		return next;
	});
}

function buildBinaryHelpers(options: MockContextOptions) {
	return {
		assertBinaryData: vi.fn((_itemIndex: number, propertyName: string): IBinaryData => {
			const fixture = options.binary?.[propertyName];

			if (fixture === undefined) {
				throw new Error(`No binary property "${propertyName}" in the test item`);
			}

			return {
				data: fixture.buffer.toString('base64'),
				mimeType: 'application/pdf',
				fileName: `${propertyName}.pdf`,
				...fixture.meta,
			} as IBinaryData;
		}),
		getBinaryDataBuffer: vi.fn(async (_itemIndex: number, propertyName: string) => {
			const fixture = options.binary?.[propertyName];

			if (fixture === undefined) {
				throw new Error(`No binary property "${propertyName}" in the test item`);
			}

			return fixture.buffer;
		}),
		prepareBinaryData: vi.fn(
			async (buffer: Buffer, fileName?: string, mimeType?: string): Promise<IBinaryData> => ({
				data: buffer.toString('base64'),
				mimeType: mimeType ?? 'application/octet-stream',
				fileName,
				fileExtension: fileName?.includes('.') ? fileName.split('.').pop() : undefined,
				fileSize: String(buffer.length),
			}),
		),
	};
}

/** Fake `IExecuteFunctions` covering everything the node touches. */
export function createExecuteFunctions(
	options: MockContextOptions = {},
): IExecuteFunctions & MockContext {
	const requests: RecordedRequest[] = [];
	const node = buildNode();
	const staticData = options.staticData ?? {};
	const credentials = { ...DEFAULT_CREDENTIALS, ...(options.credentials ?? {}) };

	const context = {
		requests,
		staticData,
		node,
		getNode: () => node,
		getInputData: () => options.items ?? [{ json: {} }],
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) =>
			resolveParameter(options, name, itemIndex, fallback),
		getCredentials: vi.fn(async (type: string) => {
			const credential = credentials[type];

			if (credential === undefined) {
				throw new Error(`Test setup is missing credentials of type "${type}"`);
			}

			return credential;
		}),
		continueOnFail: () => options.continueOnFail === true,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({
			id: 'wf-1',
			name: options.workflowName ?? 'Test Workflow',
			active: true,
		}),
		helpers: {
			httpRequestWithAuthentication: buildRequestHelper(options, requests),
			...buildBinaryHelpers(options),
		},
	};

	return context as unknown as IExecuteFunctions & MockContext;
}

/** Fake `ILoadOptionsFunctions`: note the parameter signature has no item index. */
export function createLoadOptionsFunctions(
	options: MockContextOptions = {},
): ILoadOptionsFunctions & MockContext {
	const base = createExecuteFunctions(options) as unknown as Record<string, unknown> & MockContext;

	return {
		...base,
		getNodeParameter: (name: string, fallback?: unknown) =>
			resolveParameter(options, name, 0, fallback),
	} as unknown as ILoadOptionsFunctions & MockContext;
}

/** Fake `IWebhookFunctions`, including the raw body the HMAC check needs. */
export function createWebhookFunctions(
	options: MockContextOptions = {},
): IWebhookFunctions & MockContext & { sentResponse: SentResponse } {
	const base = createExecuteFunctions(options) as unknown as Record<string, unknown> & MockContext;
	const body = options.body ?? {};
	const rawBody = options.rawBody ?? Buffer.from(JSON.stringify(body), 'utf8');
	const sentResponse: SentResponse = {};

	// Enough of an express response for a node that sets a status and a body.
	const responseObject = {
		status(statusCode: number) {
			sentResponse.statusCode = statusCode;

			return responseObject;
		},
		json(payload: unknown) {
			sentResponse.body = payload;

			return responseObject;
		},
		send(payload: unknown) {
			sentResponse.body = payload;

			return responseObject;
		},
	};

	return {
		...base,
		getNodeParameter: (name: string, fallback?: unknown) =>
			resolveParameter(options, name, 0, fallback),
		getBodyData: () => body,
		getHeaderData: () => options.headers ?? {},
		getRequestObject: () => ({ rawBody: options.rawBody === null ? undefined : rawBody }),
		getResponseObject: () => responseObject,
		sentResponse,
		getNodeWebhookUrl: () => options.webhookUrl ?? 'https://n8n.example.com/webhook/docusign',
	} as unknown as IWebhookFunctions & MockContext & { sentResponse: SentResponse };
}

/** Fake `IHookFunctions` for the webhook lifecycle methods. */
export function createHookFunctions(
	options: MockContextOptions = {},
): IHookFunctions & MockContext {
	const base = createExecuteFunctions(options) as unknown as Record<string, unknown> & MockContext;

	return {
		...base,
		getNodeParameter: (name: string, fallback?: unknown) =>
			resolveParameter(options, name, 0, fallback),
		getNodeWebhookUrl: () => options.webhookUrl ?? 'https://n8n.example.com/webhook/docusign',
	} as unknown as IHookFunctions & MockContext;
}

/** The context object the action handlers receive. */
export const testDocusignContext = {
	credentialType: 'docusignOAuth2Api',
	accountBaseUrl: ACCOUNT_BASE_URL,
	accountId: ACCOUNT_ID,
	apiBaseUrl: `${ACCOUNT_BASE_URL}/restapi/v2.1/accounts/${ACCOUNT_ID}`,
	oauthBaseUrl: 'https://account-d.docusign.com',
};
