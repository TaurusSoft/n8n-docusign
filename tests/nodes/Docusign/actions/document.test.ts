import { describe, expect, it } from 'vitest';

import { documentOperationHandlers } from '../../../../nodes/Docusign/actions/document';
import { createExecuteFunctions, testDocusignContext } from '../../../helpers/mockContexts';
import { API_BASE_URL } from '../../../helpers/msw';

const ENVELOPE_ID = 'env-1';
const PDF = Buffer.from('%PDF-1.7 signed');

describe('document: getAll', () => {
	it('flattens envelopeDocuments into one item per document', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [{ envelopeDocuments: [{ documentId: '1' }, { documentId: 'certificate' }] }],
		});

		const items = await documentOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/documents`);
		expect(items.map((item) => item.json.documentId)).toEqual(['1', 'certificate']);
	});

	it('passes the include options through as snake_case query parameters', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				options: { includeTabs: true, includeMetadata: true },
			},
			responses: [{ envelopeDocuments: [] }],
		});

		await documentOperationHandlers.getAll(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({ include_tabs: true, include_metadata: true });
	});

	it('returns nothing when the envelope has no documents', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, options: {} },
			responses: [{}],
		});

		expect(await documentOperationHandlers.getAll(ctx, 0, testDocusignContext)).toEqual([]);
	});
});

describe('document: download', () => {
	const downloadCtx = (documentId: string, options: Record<string, unknown> = {}) =>
		createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				documentId,
				binaryPropertyName: 'data',
				options,
			},
			responses: [
				{
					body: PDF,
					headers: { 'content-type': 'application/pdf' },
				},
			],
		});

	it('requests the document as a raw buffer with the full response', async () => {
		const ctx = downloadCtx('combined');

		await documentOperationHandlers.download(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.url).toBe(
			`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/documents/combined`,
		);
		expect(ctx.requests[0].options.encoding).toBe('arraybuffer');
		expect(ctx.requests[0].options.returnFullResponse).toBe(true);
	});

	it('writes the document into the requested binary field', async () => {
		const ctx = downloadCtx('combined');

		const items = await documentOperationHandlers.download(ctx, 0, testDocusignContext);

		expect(Buffer.from(items[0].binary?.data.data ?? '', 'base64').equals(PDF)).toBe(true);
		expect(items[0].json).toEqual({ envelopeId: ENVELOPE_ID, documentId: 'combined' });
		expect(items[0].pairedItem).toEqual({ item: 0 });
	});

	it.each([
		['combined', `${ENVELOPE_ID}.pdf`],
		['archive', `${ENVELOPE_ID}.zip`],
		['certificate', `${ENVELOPE_ID}_certificate.pdf`],
		['2', `${ENVELOPE_ID}_document_2.pdf`],
	])('derives a sensible file name for documentId "%s"', async (documentId, expected) => {
		const ctx = downloadCtx(documentId);

		const items = await documentOperationHandlers.download(ctx, 0, testDocusignContext);

		expect(items[0].binary?.data.fileName).toBe(expected);
	});

	it('prefers an explicitly configured file name', async () => {
		const ctx = downloadCtx('combined', { fileName: 'my-contract.pdf' });

		const items = await documentOperationHandlers.download(ctx, 0, testDocusignContext);

		expect(items[0].binary?.data.fileName).toBe('my-contract.pdf');
	});

	it('forwards the download options as query parameters', async () => {
		const ctx = downloadCtx('combined', {
			certificate: true,
			showChanges: false,
			watermark: true,
		});

		await documentOperationHandlers.download(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.qs).toEqual({
			certificate: true,
			show_changes: false,
			watermark: true,
		});
	});
});

describe('document: add', () => {
	it('PUTs the documents with IDs starting at the configured offset', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				envelopeId: ENVELOPE_ID,
				binaryPropertyNames: 'first,second',
				startDocumentId: 3,
			},
			binary: {
				first: { buffer: Buffer.from('a'), meta: { fileName: 'a.pdf' } },
				second: { buffer: Buffer.from('b'), meta: { fileName: 'b.pdf' } },
			},
			responses: [{ envelopeDocuments: [] }],
		});

		await documentOperationHandlers.add(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('PUT');
		expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/envelopes/${ENVELOPE_ID}/documents`);
		expect(ctx.requests[0].options.body).toEqual({
			documents: [
				{
					documentId: '3',
					name: 'a.pdf',
					fileExtension: 'pdf',
					documentBase64: Buffer.from('a').toString('base64'),
				},
				{
					documentId: '4',
					name: 'b.pdf',
					fileExtension: 'pdf',
					documentBase64: Buffer.from('b').toString('base64'),
				},
			],
		});
	});
});

describe('document: delete', () => {
	it('sends one entry per document ID', async () => {
		const ctx = createExecuteFunctions({
			parameters: { envelopeId: ENVELOPE_ID, documentIds: '2, 3 ,' },
			responses: [{}],
		});

		await documentOperationHandlers.delete(ctx, 0, testDocusignContext);

		expect(ctx.requests[0].options.method).toBe('DELETE');
		expect(ctx.requests[0].options.body).toEqual({
			documents: [{ documentId: '2' }, { documentId: '3' }],
		});
	});
});
