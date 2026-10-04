import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest } from '../GenericFunctions';
import { jsonItems, splitList } from './helpers';
import type { OperationHandler } from './helpers';

const recipient: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		authenticationMethod?: string;
		recipientId?: string;
		frameAncestors?: string;
		messageOrigins?: string;
	};

	const body: IDataObject = {
		returnUrl: ctx.getNodeParameter('returnUrl', itemIndex) as string,
		userName: ctx.getNodeParameter('recipientName', itemIndex) as string,
		email: ctx.getNodeParameter('recipientEmail', itemIndex) as string,
		clientUserId: ctx.getNodeParameter('clientUserId', itemIndex) as string,
		authenticationMethod: options.authenticationMethod ?? 'none',
	};

	if (options.recipientId !== undefined && options.recipientId !== '') {
		body.recipientId = options.recipientId;
	}

	const frameAncestors = splitList(options.frameAncestors);
	const messageOrigins = splitList(options.messageOrigins);

	// Docusign only accepts focused view settings when both lists are present.
	if (frameAncestors.length > 0 && messageOrigins.length > 0) {
		body.frameAncestors = frameAncestors;
		body.messageOrigins = messageOrigins;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/views/recipient`,
		body,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const sender: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/views/sender`,
		{ returnUrl: ctx.getNodeParameter('returnUrl', itemIndex) as string },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const correct: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/views/correct`,
		{ returnUrl: ctx.getNodeParameter('returnUrl', itemIndex) as string },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const envelopeViewOperationHandlers: Record<string, OperationHandler> = {
	correct,
	recipient,
	sender,
};
