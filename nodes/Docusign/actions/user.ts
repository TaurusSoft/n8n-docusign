import type { IDataObject } from 'n8n-workflow';

import { docusignApiRequest, docusignApiRequestAllItems } from '../GenericFunctions';
import { jsonItems, splitList } from './helpers';
import type { OperationHandler } from './helpers';

const get: OperationHandler = async (ctx, itemIndex, context) => {
	const userId = ctx.getNodeParameter('userId', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { additionalInfo?: boolean };

	const qs: IDataObject = {};
	if (options.additionalInfo === true) {
		qs.additional_info = true;
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'GET',
		`/users/${userId}`,
		undefined,
		qs,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const getAll: OperationHandler = async (ctx, itemIndex, context) => {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
	const filters = ctx.getNodeParameter('filters', itemIndex, {}) as {
		status?: string[];
		email?: string;
		userNameSubstring?: string;
	};
	const options = ctx.getNodeParameter('options', itemIndex, {}) as { additionalInfo?: boolean };

	const qs: IDataObject = {};
	if (filters.status !== undefined && filters.status.length > 0) {
		qs.status = filters.status.join(',');
	}
	if (filters.email !== undefined && filters.email !== '') {
		qs.email = filters.email;
	}
	if (filters.userNameSubstring !== undefined && filters.userNameSubstring !== '') {
		qs.user_name_substring = filters.userNameSubstring;
	}
	if (options.additionalInfo === true) {
		qs.additional_info = true;
	}

	const limit = returnAll ? undefined : (ctx.getNodeParameter('limit', itemIndex) as number);

	const users = await docusignApiRequestAllItems(
		ctx,
		context,
		'users',
		'GET',
		'/users',
		undefined,
		qs,
		limit,
	);

	return jsonItems(users, itemIndex);
};

const create: OperationHandler = async (ctx, itemIndex, context) => {
	const userName = ctx.getNodeParameter('userName', itemIndex) as string;
	const email = ctx.getNodeParameter('email', itemIndex) as string;
	const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as {
		firstName?: string;
		lastName?: string;
		activationAccessCode?: string;
		permissionProfileId?: string;
		groupIds?: string;
	};

	const newUser: IDataObject = { userName, email };

	if (additionalFields.firstName !== undefined && additionalFields.firstName !== '') {
		newUser.firstName = additionalFields.firstName;
	}
	if (additionalFields.lastName !== undefined && additionalFields.lastName !== '') {
		newUser.lastName = additionalFields.lastName;
	}
	if (
		additionalFields.activationAccessCode !== undefined &&
		additionalFields.activationAccessCode !== ''
	) {
		newUser.activationAccessCode = additionalFields.activationAccessCode;
	}
	if (
		additionalFields.permissionProfileId !== undefined &&
		additionalFields.permissionProfileId !== ''
	) {
		newUser.permissionProfileId = additionalFields.permissionProfileId;
	}

	const groupIds = splitList(additionalFields.groupIds);
	if (groupIds.length > 0) {
		newUser.groupList = groupIds.map((groupId) => ({ groupId }));
	}

	const response = (await docusignApiRequest(ctx, context, 'POST', '/users', {
		newUsers: [newUser],
	})) as IDataObject;

	const createdUsers = (response?.newUsers as IDataObject[] | undefined) ?? [];

	return jsonItems(createdUsers.length > 0 ? createdUsers : response, itemIndex);
};

const update: OperationHandler = async (ctx, itemIndex, context) => {
	const userId = ctx.getNodeParameter('userId', itemIndex) as string;
	const updateFields = ctx.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;

	const body: IDataObject = {};
	for (const [key, value] of Object.entries(updateFields)) {
		if (value !== undefined && value !== '') {
			body[key] = value;
		}
	}

	const response = (await docusignApiRequest(
		ctx,
		context,
		'PUT',
		`/users/${userId}`,
		body,
	)) as IDataObject;

	return jsonItems(response, itemIndex);
};

const deleteUser: OperationHandler = async (ctx, itemIndex, context) => {
	const userId = ctx.getNodeParameter('userId', itemIndex) as string;

	const response = (await docusignApiRequest(ctx, context, 'DELETE', '/users', {
		users: [{ userId }],
	})) as IDataObject;

	return jsonItems(response, itemIndex);
};

export const userOperationHandlers: Record<string, OperationHandler> = {
	create,
	delete: deleteUser,
	get,
	getAll,
	update,
};
