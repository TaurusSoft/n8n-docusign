import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import {
	docusignApiRequest,
	docusignApiRequestAllItems,
	fileNameFromContentDisposition,
	getCredentialType,
	removeEmptyValues,
	resolveDocusignContext,
	resolveFileExtension,
	responseToBinary,
	documentsFromBinary,
	toDocusignError,
} from '../../../nodes/Docusign/GenericFunctions';
import userInfoFixture from '../../fixtures/userinfo.json';
import { createExecuteFunctions, testDocusignContext } from '../../helpers/mockContexts';
import { ACCOUNT_BASE_URL, ACCOUNT_ID, API_BASE_URL } from '../../helpers/msw';

describe('getCredentialType', () => {
	it('maps oAuth2 onto the OAuth2 credential', () => {
		expect(getCredentialType('oAuth2')).toBe('docusignOAuth2Api');
	});

	it('maps jwt onto the JWT credential', () => {
		expect(getCredentialType('jwt')).toBe('docusignJwtApi');
	});

	it('explains what to do when no credential was selected', () => {
		expect(() => getCredentialType('none')).toThrow(/Pick either OAuth2 or JWT/);
	});

	it('rejects an unknown value', () => {
		expect(() => getCredentialType('basic')).toThrow(/Unknown Docusign authentication method/);
	});
});

describe('resolveDocusignContext', () => {
	it('uses the credential overrides without calling userinfo', async () => {
		const ctx = createExecuteFunctions();

		const context = await resolveDocusignContext(ctx, 'docusignOAuth2Api');

		expect(context).toEqual({
			credentialType: 'docusignOAuth2Api',
			accountBaseUrl: ACCOUNT_BASE_URL,
			accountId: ACCOUNT_ID,
			apiBaseUrl: API_BASE_URL,
			oauthBaseUrl: 'https://account-d.docusign.com',
		});
		expect(ctx.requests).toHaveLength(0);
	});

	it('falls back to the default account from userinfo', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			responses: [userInfoFixture],
		});

		const context = await resolveDocusignContext(ctx, 'docusignOAuth2Api');

		expect(context.accountId).toBe('11111111-2222-3333-4444-555555555555');
		expect(context.accountBaseUrl).toBe('https://demo.docusign.net');
		expect(ctx.requests[0].options.url).toBe('https://account-d.docusign.com/oauth/userinfo');
	});

	it('honours an explicitly configured account ID', async () => {
		const ctx = createExecuteFunctions({
			credentials: {
				docusignOAuth2Api: {
					environment: 'demo',
					accountId: '00000000-0000-0000-0000-000000000000',
				},
			},
			responses: [userInfoFixture],
		});

		const context = await resolveDocusignContext(ctx, 'docusignOAuth2Api');

		expect(context.accountId).toBe('00000000-0000-0000-0000-000000000000');
	});

	it('uses the production auth host for production credentials', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'production' } },
			responses: [userInfoFixture],
		});

		const context = await resolveDocusignContext(ctx, 'docusignOAuth2Api');

		expect(context.oauthBaseUrl).toBe('https://account.docusign.com');
	});

	it('names the available accounts when the configured one does not exist', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'demo', accountId: 'missing' } },
			responses: [userInfoFixture],
		});

		await expect(resolveDocusignContext(ctx, 'docusignOAuth2Api')).rejects.toThrow(
			/Primary Account/,
		);
	});

	it('reports an authenticated user without any accounts', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			responses: [{ accounts: [] }],
		});

		await expect(resolveDocusignContext(ctx, 'docusignOAuth2Api')).rejects.toThrow(
			/has no accounts/,
		);
	});

	it('falls back to the first account when none is flagged as default', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			responses: [{ accounts: [{ account_id: 'only', base_uri: 'https://na3.docusign.net' }] }],
		});

		const context = await resolveDocusignContext(ctx, 'docusignOAuth2Api');

		expect(context.accountId).toBe('only');
		expect(context.accountBaseUrl).toBe('https://na3.docusign.net');
	});

	it('fails clearly when userinfo returns no usable base URI', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignOAuth2Api: { environment: 'demo' } },
			responses: [{ accounts: [{ account_id: 'acc', is_default: true }] }],
		});

		await expect(resolveDocusignContext(ctx, 'docusignOAuth2Api')).rejects.toThrow(
			/did not return a usable account ID and base URI/,
		);
	});

	it('works the same way for the JWT credential', async () => {
		const ctx = createExecuteFunctions({
			credentials: { docusignJwtApi: { environment: 'demo' } },
			responses: [userInfoFixture],
		});

		const context = await resolveDocusignContext(ctx, 'docusignJwtApi');

		expect(context.credentialType).toBe('docusignJwtApi');
		expect(context.accountId).toBe(ACCOUNT_ID);
		expect(ctx.requests[0].credentialType).toBe('docusignJwtApi');
	});
});

describe('docusignApiRequest', () => {
	it('builds an account-scoped URL from the endpoint', async () => {
		const ctx = createExecuteFunctions({ responses: [{ ok: true }] });

		await docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes/abc');

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/abc`);
		expect(ctx.requests[0].options.method).toBe('GET');
	});

	it('uses an absolute URL when one is given, e.g. to follow nextUri', async () => {
		const ctx = createExecuteFunctions({ responses: [{ ok: true }] });

		await docusignApiRequest(
			ctx,
			testDocusignContext,
			'GET',
			'/ignored',
			undefined,
			{},
			{
				url: 'https://demo.docusign.net/restapi/v2.1/accounts/x/envelopes?start_position=10',
			},
		);

		expect(ctx.requests[0].options.url).toContain('start_position=10');
	});

	it('drops empty query values n8n leaves behind', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes', undefined, {
			status: 'sent',
			search_text: '',
			include: [],
			count: 10,
		});

		expect(ctx.requests[0].options.qs).toEqual({ status: 'sent', count: 10 });
	});

	it('omits the query entirely when nothing is left', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes', undefined, {
			search_text: '',
		});

		expect(ctx.requests[0].options.qs).toBeUndefined();
	});

	it('sends an explicit empty body, which some Docusign PUT endpoints require', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(ctx, testDocusignContext, 'PUT', '/envelopes/abc', {});

		expect(ctx.requests[0].options.body).toEqual({});
	});

	it('omits the body when none was passed', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes/abc');

		expect(ctx.requests[0].options.body).toBeUndefined();
	});

	it('requests JSON by default', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes/abc');

		expect(ctx.requests[0].options.json).toBe(true);
		expect(ctx.requests[0].options.headers?.Accept).toBe('application/json');
	});

	it('switches off JSON parsing for binary downloads', async () => {
		const ctx = createExecuteFunctions({ responses: [{ body: Buffer.from('x') }] });

		await docusignApiRequest(
			ctx,
			testDocusignContext,
			'GET',
			'/doc',
			undefined,
			{},
			{
				encoding: 'arraybuffer',
				returnFullResponse: true,
			},
		);

		expect(ctx.requests[0].options.json).toBe(false);
		expect(ctx.requests[0].options.encoding).toBe('arraybuffer');
		expect(ctx.requests[0].options.returnFullResponse).toBe(true);
	});

	it('does not ask for JSON on a binary download', async () => {
		const ctx = createExecuteFunctions({ responses: [{ body: Buffer.from('x') }] });

		await docusignApiRequest(
			ctx,
			testDocusignContext,
			'GET',
			'/doc',
			undefined,
			{},
			{
				encoding: 'arraybuffer',
				returnFullResponse: true,
			},
		);

		expect(ctx.requests[0].options.headers?.Accept).toBe('*/*');
	});

	it('lets a caller state the content type it expects', async () => {
		const ctx = createExecuteFunctions({ responses: [{ body: Buffer.from('x') }] });

		await docusignApiRequest(
			ctx,
			testDocusignContext,
			'GET',
			'/doc',
			undefined,
			{},
			{
				encoding: 'arraybuffer',
				headers: { Accept: 'application/zip' },
			},
		);

		expect(ctx.requests[0].options.headers?.Accept).toBe('application/zip');
	});

	it('merges extra headers', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(
			ctx,
			testDocusignContext,
			'GET',
			'/x',
			undefined,
			{},
			{
				headers: { 'X-Custom': 'yes' },
			},
		);

		expect(ctx.requests[0].options.headers).toMatchObject({
			Accept: 'application/json',
			'X-Custom': 'yes',
		});
	});

	it('uses the credential type from the context', async () => {
		const ctx = createExecuteFunctions({ responses: [{}] });

		await docusignApiRequest(
			ctx,
			{ ...testDocusignContext, credentialType: 'docusignJwtApi' },
			'GET',
			'/x',
		);

		expect(ctx.requests[0].credentialType).toBe('docusignJwtApi');
	});

	it('maps a Docusign error body into a NodeApiError', async () => {
		const ctx = createExecuteFunctions({
			responses: [
				Object.assign(new Error('Request failed'), {
					response: {
						status: 404,
						body: { errorCode: 'ENVELOPE_DOES_NOT_EXIST', message: 'Envelope not found.' },
					},
				}),
			],
		});

		await expect(
			docusignApiRequest(ctx, testDocusignContext, 'GET', '/envelopes/x'),
		).rejects.toThrow(NodeApiError);
	});
});

describe('docusignApiRequestAllItems', () => {
	it('follows nextUri across pages and resolves it against the account host', async () => {
		const ctx = createExecuteFunctions({
			responses: [
				{
					envelopes: [{ envelopeId: '1' }, { envelopeId: '2' }],
					resultSetSize: 2,
					totalSetSize: 3,
					nextUri: '/restapi/v2.1/accounts/acc/envelopes?start_position=2',
				},
				{ envelopes: [{ envelopeId: '3' }], resultSetSize: 1, totalSetSize: 3 },
			],
		});

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
		);

		expect(results.map((row) => row.envelopeId)).toEqual(['1', '2', '3']);
		expect(ctx.requests[1].options.url).toBe(
			`${ACCOUNT_BASE_URL}/restapi/v2.1/accounts/acc/envelopes?start_position=2`,
		);
	});

	it('accepts an absolute nextUri unchanged', async () => {
		const ctx = createExecuteFunctions({
			responses: [
				{
					users: [{ userId: '1' }],
					resultSetSize: 1,
					totalSetSize: 2,
					nextUri: 'https://elsewhere.docusign.net/next',
				},
				{ users: [{ userId: '2' }], resultSetSize: 1, totalSetSize: 2 },
			],
		});

		await docusignApiRequestAllItems(ctx, testDocusignContext, 'users', 'GET', '/users');

		expect(ctx.requests[1].options.url).toBe('https://elsewhere.docusign.net/next');
	});

	it('advances start_position itself when there is no nextUri', async () => {
		const ctx = createExecuteFunctions({
			responses: [
				{ users: [{ userId: '1' }], resultSetSize: 1, totalSetSize: 2, startPosition: 0 },
				{ users: [{ userId: '2' }], resultSetSize: 1, totalSetSize: 2, startPosition: 1 },
			],
		});

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'users',
			'GET',
			'/users',
		);

		expect(results).toHaveLength(2);
		expect(ctx.requests[0].options.qs).toMatchObject({ start_position: 0, count: 100 });
		expect(ctx.requests[1].options.qs).toMatchObject({ start_position: 1 });
	});

	it('stops after a short page when the server reports no total', async () => {
		const ctx = createExecuteFunctions({
			responses: [{ users: [{ userId: '1' }], resultSetSize: 1 }],
		});

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'users',
			'GET',
			'/users',
		);

		expect(results).toHaveLength(1);
		expect(ctx.requests).toHaveLength(1);
	});

	it('stops on an empty page', async () => {
		const ctx = createExecuteFunctions({ responses: [{ users: [], resultSetSize: 0 }] });

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'users',
			'GET',
			'/users',
		);

		expect(results).toEqual([]);
	});

	it('returns an empty array when the property is absent', async () => {
		const ctx = createExecuteFunctions({ responses: [{ totalSetSize: 0 }] });

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
		);

		expect(results).toEqual([]);
	});

	it('truncates to the requested limit and stops fetching', async () => {
		const ctx = createExecuteFunctions({
			responses: [
				{
					envelopes: [{ envelopeId: '1' }, { envelopeId: '2' }],
					resultSetSize: 2,
					totalSetSize: 100,
					nextUri: '/next',
				},
			],
		});

		const results = await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
			undefined,
			{},
			1,
		);

		expect(results).toHaveLength(1);
		expect(ctx.requests).toHaveLength(1);
	});

	it('asks for exactly the limit when it is below one page', async () => {
		const ctx = createExecuteFunctions({
			responses: [{ envelopes: [{ envelopeId: '1' }], resultSetSize: 1, totalSetSize: 1 }],
		});

		await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
			undefined,
			{},
			5,
		);

		expect(ctx.requests[0].options.qs).toMatchObject({ count: 5 });
	});

	it('uses the full page size when the limit exceeds it', async () => {
		const ctx = createExecuteFunctions({
			responses: [{ envelopes: [], resultSetSize: 0 }],
		});

		await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
			undefined,
			{},
			500,
		);

		expect(ctx.requests[0].options.qs).toMatchObject({ count: 100 });
	});

	it('keeps the caller filters on the first request', async () => {
		const ctx = createExecuteFunctions({
			responses: [{ envelopes: [], resultSetSize: 0 }],
		});

		await docusignApiRequestAllItems(
			ctx,
			testDocusignContext,
			'envelopes',
			'GET',
			'/envelopes',
			undefined,
			{ status: 'completed' },
		);

		expect(ctx.requests[0].options.qs).toMatchObject({ status: 'completed' });
	});
});

describe('removeEmptyValues', () => {
	it('removes undefined, null, empty strings and empty arrays', () => {
		expect(
			removeEmptyValues({
				keep: 'yes',
				zero: 0,
				no: false,
				undef: undefined,
				nul: null,
				empty: '',
				emptyArray: [],
				filledArray: ['a'],
			}),
		).toEqual({ keep: 'yes', zero: 0, no: false, filledArray: ['a'] });
	});
});

describe('toDocusignError', () => {
	const ctx = createExecuteFunctions() as unknown as IExecuteFunctions;

	it('adds a hint for a known error code', () => {
		const error = toDocusignError(ctx, {
			response: { body: { errorCode: 'USER_LACKS_PERMISSIONS', message: 'Nope.' } },
		});

		expect(error.message).toContain('USER_LACKS_PERMISSIONS');
		expect(error.description).toContain('account administrator');
	});

	it('keeps the Docusign message for an unknown error code', () => {
		const error = toDocusignError(ctx, {
			response: { body: { errorCode: 'SOMETHING_NEW', message: 'Unexpected.' } },
		});

		expect(error.message).toContain('SOMETHING_NEW');
		expect(error.description).toContain('Unexpected.');
	});

	it('parses a stringified error body', () => {
		const error = toDocusignError(ctx, {
			response: { body: JSON.stringify({ errorCode: 'ENVELOPE_DOES_NOT_EXIST', message: 'No.' }) },
		});

		expect(error.message).toContain('ENVELOPE_DOES_NOT_EXIST');
	});

	it('survives a body that is not JSON at all', () => {
		expect(() => toDocusignError(ctx, { response: { body: '<html>502</html>' } })).not.toThrow();
	});

	it('survives an error without any body', () => {
		expect(() => toDocusignError(ctx, new Error('socket hang up'))).not.toThrow();
	});

	it('passes an existing NodeApiError through unchanged', () => {
		const original = toDocusignError(ctx, { response: { body: { errorCode: 'X', message: 'y' } } });

		expect(toDocusignError(ctx, original)).toBe(original);
	});
});

describe('documentsFromBinary', () => {
	it('turns binary properties into base64 documents numbered from one', async () => {
		const ctx = createExecuteFunctions({
			binary: {
				data: { buffer: Buffer.from('first'), meta: { fileName: 'contract.pdf' } },
				second: { buffer: Buffer.from('second'), meta: { fileName: 'annex.docx' } },
			},
		});

		const documents = await documentsFromBinary(ctx, 0, 'data, second');

		expect(documents).toEqual([
			{
				documentId: '1',
				name: 'contract.pdf',
				fileExtension: 'pdf',
				documentBase64: Buffer.from('first').toString('base64'),
			},
			{
				documentId: '2',
				name: 'annex.docx',
				fileExtension: 'docx',
				documentBase64: Buffer.from('second').toString('base64'),
			},
		]);
	});

	it('starts numbering at the requested offset', async () => {
		const ctx = createExecuteFunctions({
			binary: { data: { buffer: Buffer.from('x') } },
		});

		const documents = await documentsFromBinary(ctx, 0, 'data', 4);

		expect(documents[0].documentId).toBe('4');
	});

	it('names a document without a file name', async () => {
		const ctx = createExecuteFunctions({
			binary: { data: { buffer: Buffer.from('x'), meta: { fileName: undefined } } },
		});

		const documents = await documentsFromBinary(ctx, 0, 'data');

		expect(documents[0].name).toBe('document_1');
	});

	it('rejects an empty property list rather than sending an empty envelope', async () => {
		const ctx = createExecuteFunctions();

		await expect(documentsFromBinary(ctx, 0, ' , ')).rejects.toThrow(
			/No binary property was given/,
		);
	});

	it('surfaces a missing binary property', async () => {
		const ctx = createExecuteFunctions({ binary: {} });

		await expect(documentsFromBinary(ctx, 0, 'missing')).rejects.toThrow(
			/No binary property "missing"/,
		);
	});
});

describe('resolveFileExtension', () => {
	it('prefers the declared extension and normalises it', () => {
		expect(resolveFileExtension('.PDF', 'x.docx', 'text/plain')).toBe('pdf');
	});

	it('falls back to the file name suffix', () => {
		expect(resolveFileExtension(undefined, 'contract.DOCX')).toBe('docx');
	});

	it('falls back to the MIME type', () => {
		expect(resolveFileExtension(undefined, 'noextension', 'image/png')).toBe('png');
	});

	it('defaults to pdf, which is what Docusign documents almost always are', () => {
		expect(resolveFileExtension(undefined, undefined, 'application/x-unknown')).toBe('pdf');
	});
});

describe('fileNameFromContentDisposition', () => {
	it('reads a quoted filename', () => {
		expect(fileNameFromContentDisposition('attachment; filename="Signed Contract.pdf"')).toBe(
			'Signed Contract.pdf',
		);
	});

	it('reads an unquoted filename', () => {
		expect(fileNameFromContentDisposition('attachment; filename=contract.pdf')).toBe(
			'contract.pdf',
		);
	});

	it('prefers and decodes the RFC 5987 form', () => {
		expect(
			fileNameFromContentDisposition("attachment; filename*=UTF-8''Vertrag%20%C3%9Cbersicht.pdf"),
		).toBe('Vertrag Übersicht.pdf');
	});

	it('returns the raw value when percent decoding fails', () => {
		expect(fileNameFromContentDisposition("attachment; filename*=UTF-8''bad%ZZ.pdf")).toBe(
			'bad%ZZ.pdf',
		);
	});

	it('returns undefined when there is no filename', () => {
		expect(fileNameFromContentDisposition('attachment')).toBeUndefined();
		expect(fileNameFromContentDisposition(undefined)).toBeUndefined();
		expect(fileNameFromContentDisposition('')).toBeUndefined();
	});
});

describe('responseToBinary', () => {
	const pdf = Buffer.from('%PDF-1.7 test');

	it('uses the filename and MIME type from the response headers', async () => {
		const ctx = createExecuteFunctions();

		const item = await responseToBinary(
			ctx,
			{
				body: pdf,
				headers: {
					'content-type': 'application/pdf; charset=binary',
					'content-disposition': 'attachment; filename="signed.pdf"',
				},
			},
			'data',
			'fallback.pdf',
		);

		expect(item.binary?.data.fileName).toBe('signed.pdf');
		expect(item.binary?.data.mimeType).toBe('application/pdf');
	});

	it('falls back to the given name when the header has none', async () => {
		const ctx = createExecuteFunctions();

		const item = await responseToBinary(ctx, { body: pdf, headers: {} }, 'data', 'fallback.pdf');

		expect(item.binary?.data.fileName).toBe('fallback.pdf');
	});

	it('assumes PDF when no content type is returned', async () => {
		const ctx = createExecuteFunctions();

		const item = await responseToBinary(ctx, { body: pdf }, 'data', 'fallback.pdf');

		expect(item.binary?.data.mimeType).toBe('application/pdf');
	});

	it('writes to the requested binary field and keeps the JSON payload', async () => {
		const ctx = createExecuteFunctions();
		const json: IDataObject = { envelopeId: 'abc' };

		const item = await responseToBinary(ctx, { body: pdf }, 'document', 'f.pdf', json);

		expect(Object.keys(item.binary ?? {})).toEqual(['document']);
		expect(item.json).toEqual(json);
	});

	it('handles an ArrayBuffer body without corrupting the bytes', async () => {
		const ctx = createExecuteFunctions();
		const arrayBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);

		const item = await responseToBinary(ctx, { body: arrayBuffer }, 'data', 'f.pdf');

		expect(Buffer.from(item.binary?.data.data ?? '', 'base64').equals(pdf)).toBe(true);
	});

	it('takes the first value of a repeated header', async () => {
		const ctx = createExecuteFunctions();

		const item = await responseToBinary(
			ctx,
			{ body: pdf, headers: { 'content-disposition': ['attachment; filename="a.pdf"', 'x'] } },
			'data',
			'fallback.pdf',
		);

		expect(item.binary?.data.fileName).toBe('a.pdf');
	});
});
