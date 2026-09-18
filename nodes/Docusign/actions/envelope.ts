import type { IDataObject } from 'n8n-workflow';

import { buildEnvelopeDefinition } from '../EnvelopeDefinition';
import { docusignApiRequest, docusignApiRequestAllItems } from '../GenericFunctions';
import { daysAgo, jsonItems, splitList, toDocusignDate } from './helpers';
import type { OperationHandler } from './helpers';

/** Docusign needs a lower bound for envelope searches; this is ours when none is given. */
const DEFAULT_SEARCH_WINDOW_DAYS = 30;

const create: OperationHandler = async (ctx, itemIndex, context) => {
	const definition = await buildEnvelopeDefinition(ctx, itemIndex);

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		'/envelopes',
		definition,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const get: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { include?: string[] };

	const qs: IDataObject = {};
	if (options.include !== undefined && options.include.length > 0) {
		qs.include = options.include.join(',');
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}`,
		undefined,
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
	const filters = ctx.getNodeParameter('filters', itemIndex, {}) as {
		status?: string[];
		fromDate?: string;
		toDate?: string;
		searchText?: string;
		envelopeIds?: string;
		userEmail?: string;
	};
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		include?: string[];
		orderBy?: string;
	};

	const qs: IDataObject = {};

	const envelopeIds = splitList(filters.envelopeIds);
	if (envelopeIds.length > 0) {
		qs.envelope_ids = envelopeIds.join(',');
	}

	const fromDate = toDocusignDate(filters.fromDate);
	if (fromDate !== undefined) {
		qs.from_date = fromDate;
	} else if (envelopeIds.length === 0) {
		// listStatusChanges rejects a request that constrains nothing at all.
		qs.from_date = daysAgo(DEFAULT_SEARCH_WINDOW_DAYS);
	}

	const toDate = toDocusignDate(filters.toDate);
	if (toDate !== undefined) {
		qs.to_date = toDate;
	}

	if (filters.status !== undefined && filters.status.length > 0) {
		qs.status = filters.status.join(',');
	}

	if (filters.searchText !== undefined && filters.searchText !== '') {
		qs.search_text = filters.searchText;
	}

	if (filters.userEmail !== undefined && filters.userEmail !== '') {
		qs.email = filters.userEmail;
	}

	if (options.include !== undefined && options.include.length > 0) {
		qs.include = options.include.join(',');
	}

	if (options.orderBy !== undefined && options.orderBy !== '') {
		qs.order_by = options.orderBy;
	}

	const limit = returnAll
		? undefined
		: (ctx.getNodeParameter('limit', itemIndex) as number);

	const envelopes = await docusignApiRequestAllItems(
		ctx,
		context,
		'envelopes',
		'GET',
		'/envelopes',
		undefined,
		qs,
		limit,
	);

	return jsonItems(envelopes, itemIndex);
};

const send: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(ctx, context, 'PUT', `/envelopes/${envelopeId}`, {
		status: 'sent',
	})) as IDataObject;

	return jsonItems(response, itemIndex);
};

const voidEnvelope: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const voidReason = ctx.getNodeParameter('voidReason', itemIndex) as string;

	const response = (await docusignApiRequest(ctx, context, 'PUT', `/envelopes/${envelopeId}`, {
		status: 'voided',
		voidedReason: voidReason,
	})) as IDataObject;

	return jsonItems(response, itemIndex);
};

const resend: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'PUT',
		`/envelopes/${envelopeId}`,
		{},
		{ resend_envelope: true },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const getFormData: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/form_data`,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const getAuditEvents: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/audit_events`,
	)) as IDataObject;

	const auditEvents = (response?.auditEvents as IDataObject[] | undefined) ?? [];

	return jsonItems(auditEvents, itemIndex);
};

export const envelopeOperationHandlers: Record<string, OperationHandler> = {
	create,
	get,
	getAll,
	getAuditEvents,
	getFormData,
	resend,
	send,
	void: voidEnvelope,
};
