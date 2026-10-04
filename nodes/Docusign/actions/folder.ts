import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest, docusignApiRequestAllItems } from '../GenericFunctions';
import { jsonItems, splitList, toDocusignDate } from './helpers';
import type { OperationHandler } from './helpers';

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		includeTemplates?: boolean;
		subFolders?: boolean;
		userFilter?: string;
	};

	const qs: IDataObject = {};
	if (options.includeTemplates === true) {
		qs.template = 'include';
	}
	if (options.subFolders === true) {
		qs.sub_folders = true;
	}
	if (options.userFilter !== undefined && options.userFilter !== '') {
		qs.user_filter = options.userFilter;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		'/folders',
		undefined,
		qs,
	)) as IDataObject;

	const folders = (response?.folders as IDataObject[] | undefined) ?? [];

	return jsonItems(folders.length > 0 ? folders : response, itemIndex);
};

const getItems: OperationHandler = async (ctx, itemIndex, context) => {
	const folderId = ctx.getNodeParameter('folderId', itemIndex) as string;
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
	const filters = ctx.getNodeParameter('filters', itemIndex, {}) as {
		fromDate?: string;
		toDate?: string;
		ownerEmail?: string;
		ownerName?: string;
		searchText?: string;
		status?: string[];
	};

	const qs: IDataObject = {};

	const fromDate = toDocusignDate(filters.fromDate);
	if (fromDate !== undefined) {
		qs.from_date = fromDate;
	}

	const toDate = toDocusignDate(filters.toDate);
	if (toDate !== undefined) {
		qs.to_date = toDate;
	}

	if (filters.ownerEmail !== undefined && filters.ownerEmail !== '') {
		qs.owner_email = filters.ownerEmail;
	}
	if (filters.ownerName !== undefined && filters.ownerName !== '') {
		qs.owner_name = filters.ownerName;
	}
	if (filters.searchText !== undefined && filters.searchText !== '') {
		qs.search_text = filters.searchText;
	}
	if (filters.status !== undefined && filters.status.length > 0) {
		qs.status = filters.status.join(',');
	}

	const limit = returnAll ? undefined : (ctx.getNodeParameter('limit', itemIndex) as number);

	const items = await docusignApiRequestAllItems(
		ctx,
		context,
		'folderItems',
		'GET',
		`/folders/${folderId}`,
		undefined,
		qs,
		limit,
	);

	return jsonItems(items, itemIndex);
};

const move: OperationHandler = async (ctx, itemIndex, context) => {
	const folderId = ctx.getNodeParameter('folderId', itemIndex) as string;
	const envelopeIds = splitList(ctx.getNodeParameter('envelopeIds', itemIndex) as string);

	const response = (await docusignApiRequest(ctx, context, 'PUT', `/folders/${folderId}`, {
		envelopeIds,
	})) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const folderOperationHandlers: Record<string, OperationHandler> = {
	getAll,
	getItems,
	move,
};
