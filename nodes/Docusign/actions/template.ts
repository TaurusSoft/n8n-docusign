import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest, docusignApiRequestAllItems } from '../GenericFunctions';
import { jsonItems, splitList } from './helpers';
import type { OperationHandler } from './helpers';

const get: OperationHandler = async (ctx, itemIndex, context) => {
	const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { include?: string[] };

	const qs: IDataObject = {};
	if (options.include !== undefined && options.include.length > 0) {
		qs.include = options.include.join(',');
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/templates/${templateId}`,
		undefined,
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
	const filters = ctx.getNodeParameter('filters', itemIndex, {}) as {
		searchText?: string;
		folderIds?: string;
		userFilter?: string;
		sharedByMe?: boolean;
	};

	const qs: IDataObject = {};

	if (filters.searchText !== undefined && filters.searchText !== '') {
		qs.search_text = filters.searchText;
	}

	const folderIds = splitList(filters.folderIds);
	if (folderIds.length > 0) {
		qs.folder_ids = folderIds.join(',');
	}

	if (filters.userFilter !== undefined && filters.userFilter !== '') {
		qs.user_filter = filters.userFilter;
	}

	if (filters.sharedByMe !== undefined) {
		qs.shared_by_me = filters.sharedByMe;
	}

	const limit = returnAll ? undefined : (ctx.getNodeParameter('limit', itemIndex) as number);

	const templates = await docusignApiRequestAllItems(
		ctx,
		context,
		'envelopeTemplates',
		'GET',
		'/templates',
		undefined,
		qs,
		limit,
	);

	return jsonItems(templates, itemIndex);
};

const getDocuments: OperationHandler = async (ctx, itemIndex, context) => {
	const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/templates/${templateId}/documents`,
	)) as IDataObject;

	const documents = (response?.templateDocuments as IDataObject[] | undefined) ?? [];

	return jsonItems(documents.length > 0 ? documents : response, itemIndex);
};

const getRecipients: OperationHandler = async (ctx, itemIndex, context) => {
	const templateId = ctx.getNodeParameter('templateId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/templates/${templateId}/recipients`,
	)) as IDataObject;

	const signers = (response?.signers as IDataObject[] | undefined) ?? [];
	const carbonCopies = (response?.carbonCopies as IDataObject[] | undefined) ?? [];
	const recipients = [...signers, ...carbonCopies];

	return jsonItems(recipients.length > 0 ? recipients : response, itemIndex);
};

export const templateOperationHandlers: Record<string, OperationHandler> = {
	get,
	getAll,
	getDocuments,
	getRecipients,
};
