import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest } from '../GenericFunctions';
import { jsonItems, splitList } from './helpers';
import type { OperationHandler } from './helpers';

interface CustomFieldOptions {
	fieldName?: string;
	required?: boolean;
	show?: boolean;
	listItems?: string;
}

/** Docusign groups custom fields by type, so every write targets one of two arrays. */
function collectionForType(fieldType: string): 'textCustomFields' | 'listCustomFields' {
	return fieldType === 'list' ? 'listCustomFields' : 'textCustomFields';
}

function buildField(field: IDataObject, options: CustomFieldOptions, fieldType: string): IDataObject {
	const result: IDataObject = { ...field };

	if (options.required !== undefined) {
		result.required = String(options.required);
	}
	if (options.show !== undefined) {
		result.show = String(options.show);
	}
	if (fieldType === 'list') {
		const listItems = splitList(options.listItems);
		if (listItems.length > 0) {
			result.listItems = listItems;
		}
	}

	return result;
}

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/envelopes/${envelopeId}/custom_fields`,
	)) as IDataObject;

	const textCustomFields = (response?.textCustomFields as IDataObject[] | undefined) ?? [];
	const listCustomFields = (response?.listCustomFields as IDataObject[] | undefined) ?? [];

	const fields = [
		...textCustomFields.map((field) => ({ ...field, fieldType: 'text' })),
		...listCustomFields.map((field) => ({ ...field, fieldType: 'list' })),
	];

	return jsonItems(fields.length > 0 ? fields : response, itemIndex);
};

const create: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const fieldType = ctx.getNodeParameter('fieldType', itemIndex) as string;
	const fieldName = ctx.getNodeParameter('fieldName', itemIndex) as string;
	const fieldValue = ctx.getNodeParameter('fieldValue', itemIndex, '') as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as CustomFieldOptions;

	const body: IDataObject = {
		[collectionForType(fieldType)]: [
			buildField({ name: fieldName, value: fieldValue }, options, fieldType),
		],
	};

	const response = (await docusignApiRequest(
		ctx,
		context,
		'POST',
		`/envelopes/${envelopeId}/custom_fields`,
		body,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const update: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const fieldType = ctx.getNodeParameter('fieldType', itemIndex) as string;
	const fieldId = ctx.getNodeParameter('fieldId', itemIndex) as string;
	const fieldValue = ctx.getNodeParameter('fieldValue', itemIndex, '') as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as CustomFieldOptions;

	const field: IDataObject = { fieldId, value: fieldValue };
	if (options.fieldName !== undefined && options.fieldName !== '') {
		field.name = options.fieldName;
	}

	const body: IDataObject = {
		[collectionForType(fieldType)]: [buildField(field, options, fieldType)],
	};

	const response = (await docusignApiRequest(
		ctx,
		context,
		'PUT',
		`/envelopes/${envelopeId}/custom_fields`,
		body,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const deleteCustomField: OperationHandler = async (ctx, itemIndex, context) => {
	const envelopeId = ctx.getNodeParameter('envelopeId', itemIndex) as string;
	const fieldType = ctx.getNodeParameter('fieldType', itemIndex) as string;
	const fieldId = ctx.getNodeParameter('fieldId', itemIndex) as string;

	const response = (await docusignApiRequest(
		ctx,
		context,
		'DELETE',
		`/envelopes/${envelopeId}/custom_fields`,
		{ [collectionForType(fieldType)]: [{ fieldId }] },
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const customFieldOperationHandlers: Record<string, OperationHandler> = {
	create,
	delete: deleteCustomField,
	getAll,
	update,
};
