import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest } from '../GenericFunctions';
import { jsonItems } from './helpers';
import type { OperationHandler } from './helpers';

const get: OperationHandler = async (ctx, itemIndex, context) => {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		includeAccountSettings?: boolean;
	};

	const qs: IDataObject = {};
	if (options.includeAccountSettings === true) {
		qs.include_account_settings = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		'',
		undefined,
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const accountOperationHandlers: Record<string, OperationHandler> = {
	get,
};
