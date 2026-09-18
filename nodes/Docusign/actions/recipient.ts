import type { IDataObject } from 'n8n-workflow';

import type { SignerInput } from '../EnvelopeDefinition';
import { buildSigners } from '../EnvelopeDefinition';
import { docusignApiRequest } from '../GenericFunctions';
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

	const signers = (response?.signers as IDataObject[] | undefined) ?? [];
	const carbonCopies = (response?.carbonCopies as IDataObject[] | undefined) ?? [];
	const certifiedDeliveries = (response?.certifiedDeliveries as IDataObject[] | undefined) ?? [];
	const inPersonSigners = (response?.inPersonSigners as IDataObject[] | undefined) ?? [];

	const recipients = [...signers, ...inPersonSigners, ...carbonCopies, ...certifiedDeliveries];

	// Some accounts return only the counters; fall back to the raw payload so
	// nothing is silently swallowed.
	return jsonItems(recipients.length > 0 ? recipients : response, itemIndex);
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
	const updateFields = ctx.getNodeParameter('updateFields', itemIndex, {}) as {
		name?: string;
		email?: string;
		routingOrder?: number;
		note?: string;
	};
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { resendEnvelope?: boolean };

	const signer: IDataObject = { recipientId };

	if (updateFields.name !== undefined && updateFields.name !== '') {
		signer.name = updateFields.name;
	}
	if (updateFields.email !== undefined && updateFields.email !== '') {
		signer.email = updateFields.email;
	}
	if (updateFields.routingOrder !== undefined) {
		signer.routingOrder = String(updateFields.routingOrder);
	}
	if (updateFields.note !== undefined && updateFields.note !== '') {
		signer.note = updateFields.note;
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
		{ signers: [signer] },
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
