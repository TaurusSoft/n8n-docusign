import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { SignerInput } from '../EnvelopeDefinition';
import { buildSigners } from '../EnvelopeDefinition';
import { docusignApiRequest } from '../GenericFunctions';
import {
	RECIPIENT_TYPES,
	collectionForRecipientType,
	flattenRecipients,
} from '../RecipientCollections';
import { jsonItems } from './helpers';
import type { OperationHandler } from './helpers';

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		includeTabs?: boolean;
		includeAnchorTabLocations?: boolean;
	};

	const qs: IDataObject = {};
	if (options.includeTabs === true) {
		qs.include_tabs = true;
	}
	if (options.includeAnchorTabLocations === true) {
		qs.include_anchor_tab_locations = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/recipients`,
		undefined,
		qs,
	)) as IDataObject;

	const recipients = flattenRecipients(response);

	// Some accounts return only the counters; fall back to the raw payload so
	// nothing is silently swallowed.
	return jsonItems(recipients ?? response, itemIndex);
};

const add: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const signersUi = ctx.getNodeParameter('signersUi', itemIndex, {}) as { signer?: SignerInput[] };
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { resendEnvelope?: boolean };

	const qs: IDataObject = {};
	if (options.resendEnvelope === true) {
		qs.resend_envelope = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/recipients`,
		{ signers: buildSigners(signersUi.signer ?? []) },
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const update: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const recipientId = ctx.getNodeParameter('recipientId', itemIndex) as string;
	const recipientType = ctx.getNodeParameter('recipientType', itemIndex, 'signer') as string;
	const updateFields = ctx.getNodeParameter('updateFields', itemIndex, {}) as {
		name?: string;
		email?: string;
		routingOrder?: number;
		note?: string;
	};
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { resendEnvelope?: boolean };

	// Docusign identifies a recipient by the group it sits in, so updating a
	// carbon copy through `signers` would change an unrelated recipient.
	const collection = collectionForRecipientType(recipientType);

	if (collection === undefined) {
		const known = RECIPIENT_TYPES.join(', ');

		throw new NodeOperationError(
			ctx.getNode(),
			`Unknown recipient type "${recipientType}". Expected one of: ${known}.`,
			{ itemIndex },
		);
	}

	const recipient: IDataObject = { recipientId };

	if (updateFields.name !== undefined && updateFields.name !== '') {
		recipient.name = updateFields.name;
	}
	if (updateFields.email !== undefined && updateFields.email !== '') {
		recipient.email = updateFields.email;
	}
	if (updateFields.routingOrder !== undefined) {
		recipient.routingOrder = String(updateFields.routingOrder);
	}
	if (updateFields.note !== undefined && updateFields.note !== '') {
		recipient.note = updateFields.note;
	}

	const qs: IDataObject = {};
	if (options.resendEnvelope === true) {
		qs.resend_envelope = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'PUT',
		`/envelopes/${envelopeId}/recipients`,
		{ [collection]: [recipient] },
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const deleteRecipient: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const recipientId = ctx.getNodeParameter('recipientId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'DELETE',
		`/envelopes/${envelopeId}/recipients/${recipientId}`,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const recipientOperationHandlers: Record<string, OperationHandler> = {
	add,
	delete: deleteRecipient,
	getAll,
	update,
};
