import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	buildAccountApiBaseUrl,
	getOAuthBaseUrl,
	normalizeAccountBaseUrl,
} from '../../shared/docusign';

export type DocusignContextFunctions =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions
	| IHookFunctions;


/**
 * Everything an API call needs beyond the endpoint itself.
 *
 * Resolved once per execution and passed down, so a workflow processing 200
 * items does not trigger 200 userinfo lookups.
 */
export interface DocusignContext {
	credentialType: string;
	/** Account host without any path, e.g. `https://demo.docusign.net`. */
	accountBaseUrl: string;
	accountId: string;
	/** Full account-scoped API base, e.g. `https://demo.docusign.net/restapi/v2.1/accounts/123`. */
	apiBaseUrl: string;
	/** Authentication service base, e.g. `https://account-d.docusign.com`. */
	oauthBaseUrl: string;
}

/** Maps the node's `authentication` parameter onto a credential type name. */
export function getCredentialType(authentication: string): string {
	if (authentication === 'oAuth2') {
		return 'docusignOAuth2Api';
	}

	if (authentication === 'jwt') {
		return 'docusignJwtApi';
	}

	if (authentication === 'none') {
		throw new Error(
			'This operation needs access to the Docusign API. Pick either OAuth2 or JWT under Authentication and connect a credential.',
		);
	}

	throw new Error(
		`Unknown Docusign authentication method "${authentication}". Expected "oAuth2" or "jwt".`,
	);
}

interface UserInfoAccount {
	account_id?: string;
	account_name?: string;
	base_uri?: string;
	is_default?: boolean;
}

/**
 * Resolves the account the node should talk to.
 *
 * Docusign hands every account its own API host, so the base URL cannot be
 * hardcoded. Explicit credential values win; otherwise the account is looked up
 * through the userinfo endpoint.
 */
export async function resolveDocusignContext(
	ctx: DocusignContextFunctions,
	credentialType: string,
): Promise<DocusignContext> {
	const credentials = await ctx.getCredentials(credentialType);

	const environment = (credentials.environment as string) ?? 'demo';
	const oauthBaseUrl = getOAuthBaseUrl(environment);
	const configuredAccountId = ((credentials.accountId as string) ?? '').trim();
	const configuredBaseUrl = ((credentials.accountBaseUrl as string) ?? '').trim();

	if (configuredAccountId !== '' && configuredBaseUrl !== '') {
		const accountBaseUrl = normalizeAccountBaseUrl(configuredBaseUrl);

		return {
			credentialType,
			accountBaseUrl,
			accountId: configuredAccountId,
			apiBaseUrl: buildAccountApiBaseUrl(accountBaseUrl, configuredAccountId),
			oauthBaseUrl,
		};
	}

	const userInfo = (await requestWithAuthentication(ctx, credentialType, {
		method: 'GET',
		url: `${oauthBaseUrl}/oauth/userinfo`,
		json: true,
	})) as { accounts?: UserInfoAccount[] };

	const accounts = userInfo?.accounts ?? [];

	if (accounts.length === 0) {
		throw new NodeOperationError(
			ctx.getNode(),
			'The authenticated Docusign user has no accounts. Check that the credential points at the right environment.',
		);
	}

	const account =
		configuredAccountId !== ''
			? accounts.find((candidate) => candidate.account_id === configuredAccountId)
			: (accounts.find((candidate) => candidate.is_default === true) ?? accounts[0]);

	if (account === undefined) {
		const available = accounts
			.map((candidate) => `${candidate.account_name ?? 'unnamed'} (${candidate.account_id})`)
			.join(', ');

		throw new NodeOperationError(
			ctx.getNode(),
			`Account "${configuredAccountId}" was not found for the authenticated user. Available accounts: ${available}`,
		);
	}

	const accountId = configuredAccountId !== '' ? configuredAccountId : (account.account_id ?? '');
	const accountBaseUrl = normalizeAccountBaseUrl(configuredBaseUrl || (account.base_uri ?? ''));

	if (accountId === '' || accountBaseUrl === '') {
		throw new NodeOperationError(
			ctx.getNode(),
			'Docusign did not return a usable account ID and base URI. Set them manually in the credential.',
		);
	}

	return {
		credentialType,
		accountBaseUrl,
		accountId,
		apiBaseUrl: buildAccountApiBaseUrl(accountBaseUrl, accountId),
		oauthBaseUrl,
	};
}

export interface DocusignRequestOptions {
	/** Return the full response instead of only the body, e.g. to read headers. */
	returnFullResponse?: boolean;
	/** Set to `arraybuffer` for document downloads. */
	encoding?: 'arraybuffer';
	headers?: IDataObject;
	/** Absolute URL to call instead of building one from `endpoint`. */
	url?: string;
}

/**
 * Calls an account-scoped eSignature endpoint.
 *
 * @param endpoint path below `/accounts/{accountId}`, e.g. `/envelopes/{id}`
 */
export async function docusignApiRequest(
	ctx: DocusignContextFunctions,
	context: DocusignContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | undefined = undefined,
	qs: IDataObject = {},
	options: DocusignRequestOptions = {},
): Promise<unknown> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: options.url ?? `${context.apiBaseUrl}${endpoint}`,
		headers: {
			Accept: 'application/json',
			...(options.headers ?? {}),
		},
		json: options.encoding === undefined,
	};

	const filteredQs = removeEmptyValues(qs);
	if (Object.keys(filteredQs).length > 0) {
		requestOptions.qs = filteredQs;
	}

	// An explicit `{}` is still sent: several Docusign PUT endpoints reject a
	// request without a body even when the change is expressed in the query.
	if (body !== undefined) {
		requestOptions.body = body;
	}

	if (options.encoding !== undefined) {
		requestOptions.encoding = options.encoding;
	}

	if (options.returnFullResponse === true) {
		requestOptions.returnFullResponse = true;
	}

	try {
		return await requestWithAuthentication(ctx, context.credentialType, requestOptions);
	} catch (error) {
		throw toDocusignError(ctx, error);
	}
}

/**
 * Walks a paginated collection.
 *
 * Docusign paginates with `start_position`/`count` and echoes `resultSetSize`
 * and `totalSetSize` back. Most list endpoints additionally return a `nextUri`,
 * which is preferred when present because it carries the server's own filters.
 */
export async function docusignApiRequestAllItems(
	ctx: DocusignContextFunctions,
	context: DocusignContext,
	propertyName: string,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | undefined = undefined,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const pageSize = limit !== undefined && limit > 0 && limit < 100 ? limit : 100;

	let query: IDataObject = { ...qs, start_position: qs.start_position ?? 0, count: pageSize };
	let nextUrl: string | undefined;
	let exhausted = false;

	while (!exhausted) {
		const response = (await docusignApiRequest(
			ctx,
			context,
			method,
			endpoint,
			body,
			nextUrl === undefined ? query : {},
			nextUrl === undefined ? {} : { url: nextUrl },
		)) as IDataObject;

		const page = (response?.[propertyName] as IDataObject[] | undefined) ?? [];
		results.push(...page);

		if (limit !== undefined && results.length >= limit) {
			return results.slice(0, limit);
		}

		const followUp = resolveNextUrl(context, response);

		if (followUp !== undefined) {
			// `nextUri` carries the server's own filters and offsets, so it wins.
			nextUrl = followUp;
			continue;
		}

		if (nextUrl !== undefined) {
			// We were following nextUri and the server stopped offering one.
			exhausted = true;
			continue;
		}

		// No nextUri at all: advance start_position ourselves and stop as soon as
		// the server reports no more rows.
		const resultSetSize = toNumber(response?.resultSetSize);
		const totalSetSize = toNumber(response?.totalSetSize);
		const startPosition = toNumber(response?.startPosition) ?? toNumber(query.start_position) ?? 0;
		const advanced = startPosition + (resultSetSize ?? page.length);

		exhausted =
			page.length === 0 ||
			resultSetSize === 0 ||
			(totalSetSize !== undefined && advanced >= totalSetSize) ||
			(totalSetSize === undefined && page.length < pageSize);

		query = { ...query, start_position: advanced };
	}

	return results;
}

/** Absolute URL for a `nextUri`, or `undefined` when there is no further page. */
function resolveNextUrl(context: DocusignContext, response: IDataObject): string | undefined {
	const nextUri = response?.nextUri;

	if (typeof nextUri !== 'string' || nextUri === '') {
		return undefined;
	}

	if (nextUri.startsWith('http://') || nextUri.startsWith('https://')) {
		return nextUri;
	}

	return `${context.accountBaseUrl}${nextUri.startsWith('/') ? '' : '/'}${nextUri}`;
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
		return Number(value);
	}

	return undefined;
}

/** Drops keys n8n's optional collections leave behind as empty strings. */
export function removeEmptyValues(input: IDataObject): IDataObject {
	const result: IDataObject = {};

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}

		if (Array.isArray(value) && value.length === 0) {
			continue;
		}

		result[key] = value;
	}

	return result;
}

/** Hints for the Docusign error codes users hit most often. */
const ERROR_HINTS: Record<string, string> = {
	ENVELOPE_DOES_NOT_EXIST:
		'The envelope ID does not exist in this account. Check that the credential points at the same environment (demo vs production) the envelope was created in.',
	USER_LACKS_PERMISSIONS:
		'The authenticated Docusign user lacks permission for this operation. Connect and account-wide endpoints usually require an account administrator.',
	USER_AUTHENTICATION_FAILED:
		'Docusign rejected the credential. Re-authorise the connection, and verify the environment matches the account.',
	CONSENT_REQUIRED:
		'The integration has not been granted consent yet. Open the consent URL once as the impersonated user and accept the requested scopes.',
	ACCOUNT_LACKS_PERMISSIONS:
		'The Docusign account plan does not include this feature. Check your plan or ask Docusign support to enable it.',
	INVALID_REQUEST_PARAMETER:
		'Docusign rejected one of the parameters. The message above names the offending field.',
	TEMPLATE_ID_INVALID: 'The template ID does not exist in this account.',
	ENVELOPE_INVALID_STATUS:
		'The envelope is not in a status that allows this operation. Draft envelopes must be sent before recipients can act, and completed envelopes can no longer be changed.',
};

/** Wraps a transport error into a NodeApiError carrying Docusign's own message. */
export function toDocusignError(ctx: DocusignContextFunctions, error: unknown): NodeApiError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error as NodeApiError;
	}

	const body = extractErrorBody(error);
	const errorCode = typeof body?.errorCode === 'string' ? body.errorCode : undefined;
	const apiMessage = typeof body?.message === 'string' ? body.message : undefined;

	const parts: string[] = [];
	if (apiMessage !== undefined) {
		parts.push(apiMessage);
	}
	if (errorCode !== undefined && ERROR_HINTS[errorCode] !== undefined) {
		parts.push(ERROR_HINTS[errorCode]);
	}

	const options: { message?: string; description?: string } = {};
	if (errorCode !== undefined) {
		options.message = `Docusign: ${errorCode}`;
	}
	if (parts.length > 0) {
		options.description = parts.join(' ');
	}

	return new NodeApiError(ctx.getNode(), error as JsonObject, options);
}

function extractErrorBody(error: unknown): IDataObject | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const candidate = error as {
		response?: { body?: unknown; data?: unknown };
		body?: unknown;
		error?: unknown;
	};

	const body =
		candidate.response?.body ?? candidate.response?.data ?? candidate.body ?? candidate.error;

	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return undefined;
		}
	}

	return typeof body === 'object' && body !== null ? (body as IDataObject) : undefined;
}

/**
 * `httpRequestWithAuthentication` is typed as returning `any`; funnelling every
 * call through here keeps that single `unknown` boundary in one place.
 */
async function requestWithAuthentication(
	ctx: DocusignContextFunctions,
	credentialType: string,
	requestOptions: IHttpRequestOptions,
): Promise<unknown> {
	return (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		credentialType,
		requestOptions,
	)) as unknown;
}

// --- Binary helpers ---------------------------------------------------------

export interface DocusignDocument extends IDataObject {
	documentId: string;
	name: string;
	fileExtension: string;
	documentBase64: string;
}

const EXTENSION_BY_MIME: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'text/plain': 'txt',
	'text/html': 'html',
	'image/png': 'png',
	'image/jpeg': 'jpg',
};

/** Turns binary input properties into Docusign `documents[]` entries. */
export async function documentsFromBinary(
	ctx: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyNames: string,
	startDocumentId = 1,
): Promise<DocusignDocument[]> {
	const names = binaryPropertyNames
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name !== '');

	if (names.length === 0) {
		throw new NodeOperationError(
			ctx.getNode(),
			'No binary property was given, so the envelope would have no documents.',
			{ itemIndex },
		);
	}

	const documents: DocusignDocument[] = [];

	for (const [offset, name] of names.entries()) {
		const binary = ctx.helpers.assertBinaryData(itemIndex, name);
		const buffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, name);

		documents.push({
			documentId: String(startDocumentId + offset),
			name: binary.fileName ?? `document_${startDocumentId + offset}`,
			fileExtension: resolveFileExtension(binary.fileExtension, binary.fileName, binary.mimeType),
			documentBase64: buffer.toString('base64'),
		});
	}

	return documents;
}

export function resolveFileExtension(
	fileExtension?: string,
	fileName?: string,
	mimeType?: string,
): string {
	if (fileExtension !== undefined && fileExtension !== '') {
		return fileExtension.replace(/^\./, '').toLowerCase();
	}

	const fromName = fileName?.includes('.') ? fileName.split('.').pop() : undefined;
	if (fromName !== undefined && fromName !== '') {
		return fromName.toLowerCase();
	}

	if (mimeType !== undefined && EXTENSION_BY_MIME[mimeType] !== undefined) {
		return EXTENSION_BY_MIME[mimeType];
	}

	return 'pdf';
}

export interface FullHttpResponse {
	body: Buffer | ArrayBuffer | string;
	headers?: Record<string, string | string[] | undefined>;
}

/** Turns a raw document response into a binary output item. */
export async function responseToBinary(
	ctx: IExecuteFunctions | IWebhookFunctions,
	response: FullHttpResponse,
	binaryPropertyName: string,
	fallbackFileName: string,
	json: IDataObject = {},
): Promise<INodeExecutionData> {
	const headers = response.headers ?? {};
	const contentType = headerValue(headers['content-type']) ?? 'application/pdf';
	const fileName =
		fileNameFromContentDisposition(headerValue(headers['content-disposition'])) ??
		fallbackFileName;

	const buffer = toBuffer(response.body);

	return {
		json,
		binary: {
			[binaryPropertyName]: await ctx.helpers.prepareBinaryData(
				buffer,
				fileName,
				contentType.split(';')[0].trim(),
			),
		},
	};
}

function toBuffer(body: Buffer | ArrayBuffer | string): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body === 'string') {
		return Buffer.from(body, 'binary');
	}

	return Buffer.from(new Uint8Array(body));
}

function headerValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

/** Reads the filename out of a `Content-Disposition` header, RFC 5987 form included. */
export function fileNameFromContentDisposition(header?: string): string | undefined {
	if (header === undefined || header === '') {
		return undefined;
	}

	const encoded = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header);
	if (encoded !== null) {
		try {
			return decodeURIComponent(encoded[1].trim());
		} catch {
			return encoded[1].trim();
		}
	}

	const plain = /filename="?([^";]+)"?/.exec(header);
	if (plain !== null) {
		return plain[1].trim();
	}

	return undefined;
}
