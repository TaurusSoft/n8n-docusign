import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { SignerInput } from '../EnvelopeDefinition';
import { buildSigners } from '../EnvelopeDefinition';
import type { DocusignContext } from '../GenericFunctions';
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

/**
 * The lowest recipient ID that is still free on the envelope.
 *
 * Recipient IDs are unique per envelope, and Docusign's POST does not allocate
 * them: it takes whatever the request names. Numbering new recipients from 1
 * therefore walks straight into the IDs the envelope already uses.
 */
async function nextFreeRecipientId(
	ctx: IExecuteFunctions,
	context: DocusignContext,
	envelopeId: string,
): Promise<number> {
	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/recipients`,
	)) as IDataObject;

	const highest = (flattenRecipients(response) ?? []).reduce((max, recipient) => {
		const id = Number.parseInt(String(recipient.recipientId ?? ''), 10);

		return Number.isNaN(id) ? max : Math.max(max, id);
	}, 0);

	return highest + 1;
}

const add: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const signersUi = ctx.getNodeParameter('signersUi', itemIndex, {}) as { signer?: SignerInput[] };
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		resendEnvelope?: boolean;
		startRecipientId?: number;
	};

	const signers = signersUi.signer ?? [];

	// Only recipients without an explicit ID need numbering, and only then is
	// the extra lookup worth a round trip.
	const needsNumbering = signers.some(
		(signer) => signer.recipientId === undefined || signer.recipientId === '',
	);

	const startRecipientId =
		options.startRecipientId ??
		(needsNumbering ? await nextFreeRecipientId(ctx, context, envelopeId) : 1);

	const qs: IDataObject = {};
	if (options.resendEnvelope === true) {
		qs.resend_envelope = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/recipients`,
		{ signers: buildSigners(signers, startRecipientId) },
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
