import type { IDataObject } from 'n8n-workflow';

import type { FullHttpResponse } from '../GenericFunctions';
import {
	docusignApiRequest,
	documentsFromBinary,
	responseToBinary,
} from '../GenericFunctions';
import { jsonItems, splitList } from './helpers';
import type { OperationHandler } from './helpers';

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		includeTabs?: boolean;
		includeMetadata?: boolean;
	};

	const qs: IDataObject = {};
	if (options.includeTabs === true) {
		qs.include_tabs = true;
	}
	if (options.includeMetadata === true) {
		qs.include_metadata = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/documents`,
		undefined,
		qs,
	)) as IDataObject;

	const documents = (response?.envelopeDocuments as IDataObject[] | undefined) ?? [];

	return jsonItems(documents, itemIndex);
};

const download: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const documentId = ctx.getNodeParameter('documentId', itemIndex) as string;
	const binaryPropertyName = ctx.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		fileName?: string;
		certificate?: boolean;
		showChanges?: boolean;
		watermark?: boolean;
	};

	const qs: IDataObject = {};
	if (options.certificate !== undefined) {
		qs.certificate = options.certificate;
	}
	if (options.showChanges !== undefined) {
		qs.show_changes = options.showChanges;
	}
	if (options.watermark !== undefined) {
		qs.watermark = options.watermark;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/documents/${documentId}`,
		undefined,
		qs,
		{ encoding: 'arraybuffer', returnFullResponse: true },
	)) as FullHttpResponse;

	const fallbackFileName =
		options.fileName !== undefined && options.fileName !== ''
			? options.fileName
			: defaultFileName(envelopeId, documentId);

	const item = await responseToBinary(ctx, response, binaryPropertyName, fallbackFileName, {
		envelopeId,
		documentId,
	});

	return [{ ...item, pairedItem: { item: itemIndex } }];
};

function defaultFileName(envelopeId: string, documentId: string): string {
	if (documentId === 'archive') {
		return `${envelopeId}.zip`;
	}

	if (documentId === 'certificate') {
		return `${envelopeId}_certificate.pdf`;
	}

	if (documentId === 'combined') {
		return `${envelopeId}.pdf`;
	}

	return `${envelopeId}_document_${documentId}.pdf`;
}

const add: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const binaryPropertyNames = ctx.getNodeParameter('binaryPropertyNames', itemIndex) as string;
	const startDocumentId = ctx.getNodeParameter('startDocumentId', itemIndex) as number;

	const documents = await documentsFromBinary(
		ctx,
		itemIndex,
		binaryPropertyNames,
		startDocumentId,
	);

	const response = (await docusignApiRequest(
		ctx,
		context,
		'PUT',
		`/envelopes/${envelopeId}/documents`,
		{ documents },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const deleteDocument: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const documentIds = splitList(ctx.getNodeParameter('documentIds', itemIndex) as string);

	const response = (await docusignApiRequest(
		ctx,
		context,
		'DELETE',
		`/envelopes/${envelopeId}/documents`,
		{ documents: documentIds.map((documentId) => ({ documentId })) },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const documentOperationHandlers: Record<string, OperationHandler> = {
	add,
	delete: deleteDocument,
	download,
	getAll,
};
