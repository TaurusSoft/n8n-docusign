import { accountOperationHandlers } from './account';
import { customFieldOperationHandlers } from './customField';
import { documentOperationHandlers } from './document';
import { envelopeOperationHandlers } from './envelope';
import { envelopeViewOperationHandlers } from './envelopeView';
import { folderOperationHandlers } from './folder';
import type { OperationRegistry } from './helpers';
import { recipientOperationHandlers } from './recipient';
import { templateOperationHandlers } from './template';
import { userOperationHandlers } from './user';

/** Single lookup table the node's `execute()` dispatches through. */
export const operationRegistry: OperationRegistry = {
	account: accountOperationHandlers,
	customField: customFieldOperationHandlers,
	document: documentOperationHandlers,
	envelope: envelopeOperationHandlers,
	envelopeView: envelopeViewOperationHandlers,
	folder: folderOperationHandlers,
	recipient: recipientOperationHandlers,
	template: templateOperationHandlers,
	user: userOperationHandlers,
};

export type { OperationHandler, OperationRegistry } from './helpers';
