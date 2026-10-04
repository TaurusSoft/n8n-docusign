import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { documentsFromBinary } from './GenericFunctions';

export interface SignerInput {
	name?: string;
	email?: string;
	recipientId?: string;
	routingOrder?: number;
	clientUserId?: string;
	signaturePlacement?: 'none' | 'anchor' | 'position';
	anchorString?: string;
	anchorXOffset?: number;
	anchorYOffset?: number;
	documentId?: string;
	pageNumber?: number;
	xPosition?: number;
	yPosition?: number;
}

export interface TemplateRoleInput {
	roleName?: string;
	name?: string;
	email?: string;
	routingOrder?: number;
	clientUserId?: string;
}

/** Converts the `Signers` fixedCollection into Docusign signer objects. */
export function buildSigners(signers: SignerInput[], startRecipientId = 1): IDataObject[] {
	return signers.map((signer, index) => {
		const result: IDataObject = {
			email: signer.email ?? '',
			name: signer.name ?? '',
			recipientId:
				signer.recipientId !== undefined && signer.recipientId !== ''
					? signer.recipientId
					: String(startRecipientId + index),
			routingOrder: String(signer.routingOrder ?? 1),
		};

		if (signer.clientUserId !== undefined && signer.clientUserId !== '') {
			result.clientUserId = signer.clientUserId;
		}

		const placement = signer.signaturePlacement ?? 'anchor';

		if (placement === 'anchor') {
			result.tabs = {
				signHereTabs: [
					{
						anchorString: signer.anchorString ?? '/sig1/',
						anchorUnits: 'pixels',
						anchorXOffset: String(signer.anchorXOffset ?? 0),
						anchorYOffset: String(signer.anchorYOffset ?? 0),
					},
				],
			};
		} else if (placement === 'position') {
			result.tabs = {
				signHereTabs: [
					{
						documentId: signer.documentId ?? '1',
						pageNumber: String(signer.pageNumber ?? 1),
						xPosition: String(signer.xPosition ?? 100),
						yPosition: String(signer.yPosition ?? 100),
					},
				],
			};
		}

		return result;
	});
}

/** Converts the `Template Roles` fixedCollection into Docusign templateRoles. */
export function buildTemplateRoles(roles: TemplateRoleInput[]): IDataObject[] {
	return roles.map((role) => {
		const result: IDataObject = {
			roleName: role.roleName ?? '',
			name: role.name ?? '',
			email: role.email ?? '',
			routingOrder: String(role.routingOrder ?? 1),
		};

		if (role.clientUserId !== undefined && role.clientUserId !== '') {
			result.clientUserId = role.clientUserId;
		}

		return result;
	});
}

interface EnvelopeAdditionalFields {
	emailBlurb?: string;
	brandId?: string;
	allowReassign?: boolean;
	enableWetSign?: boolean;
	envelopeIdStamping?: boolean;
	expireAfter?: number;
	reminderDelay?: number;
	reminderFrequency?: number;
}

/**
 * Applies the `Additional Fields` collection.
 *
 * Docusign expects booleans and numbers inside an envelope definition as
 * strings, so everything is stringified on the way out.
 */
export function applyAdditionalFields(
	definition: IDataObject,
	additionalFields: EnvelopeAdditionalFields,
): IDataObject {
	if (additionalFields.emailBlurb !== undefined && additionalFields.emailBlurb !== '') {
		definition.emailBlurb = additionalFields.emailBlurb;
	}

	if (additionalFields.brandId !== undefined && additionalFields.brandId !== '') {
		definition.brandId = additionalFields.brandId;
	}

	if (additionalFields.allowReassign !== undefined) {
		definition.allowReassign = String(additionalFields.allowReassign);
	}

	if (additionalFields.enableWetSign !== undefined) {
		definition.enableWetSign = String(additionalFields.enableWetSign);
	}

	if (additionalFields.envelopeIdStamping !== undefined) {
		definition.envelopeIdStamping = String(additionalFields.envelopeIdStamping);
	}

	const hasExpiration = additionalFields.expireAfter !== undefined;
	const hasReminders =
		additionalFields.reminderDelay !== undefined ||
		additionalFields.reminderFrequency !== undefined;

	// `useAccountDefaults: false` is all or nothing: whatever this block leaves
	// out does not fall back to the account, it simply does not apply to the
	// envelope. Reminders alone therefore drop the expiration policy, which the
	// field descriptions spell out - Docusign offers no way to override one half.
	if (hasExpiration || hasReminders) {
		const notification: IDataObject = { useAccountDefaults: 'false' };

		if (hasExpiration) {
			notification.expirations = {
				expireEnabled: 'true',
				expireAfter: String(additionalFields.expireAfter),
				expireWarn: '0',
			};
		}

		if (hasReminders) {
			notification.reminders = {
				reminderEnabled: 'true',
				reminderDelay: String(additionalFields.reminderDelay ?? 3),
				reminderFrequency: String(additionalFields.reminderFrequency ?? 3),
			};
		}

		definition.notification = notification;
	}

	return definition;
}

/** Builds the envelope definition for `Envelope: Create`. */
export async function buildEnvelopeDefinition(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const source = ctx.getNodeParameter('source', itemIndex) as 'documents' | 'template' | 'json';

	if (source === 'json') {
		return parseEnvelopeDefinitionJson(ctx, itemIndex);
	}

	const definition: IDataObject = {
		emailSubject: ctx.getNodeParameter('emailSubject', itemIndex) as string,
		status: ctx.getNodeParameter('envelopeStatus', itemIndex) as string,
	};

	if (source === 'documents') {
		const binaryPropertyNames = ctx.getNodeParameter('binaryPropertyNames', itemIndex) as string;
		definition.documents = await documentsFromBinary(ctx, itemIndex, binaryPropertyNames);

		const signersUi = ctx.getNodeParameter('signersUi', itemIndex, {}) as {
			signer?: SignerInput[];
		};
		const signers = signersUi.signer ?? [];

		if (signers.length === 0) {
			throw new NodeOperationError(
				ctx.getNode(),
				'At least one signer is required to create an envelope from documents.',
				{ itemIndex },
			);
		}

		definition.recipients = { signers: buildSigners(signers) };
	} else {
		definition.templateId = ctx.getNodeParameter('templateId', itemIndex) as string;

		const templateRolesUi = ctx.getNodeParameter('templateRolesUi', itemIndex, {}) as {
			role?: TemplateRoleInput[];
		};
		const roles = templateRolesUi.role ?? [];

		if (roles.length === 0) {
			throw new NodeOperationError(
				ctx.getNode(),
				'At least one template role is required to create an envelope from a template.',
				{ itemIndex },
			);
		}

		definition.templateRoles = buildTemplateRoles(roles);
	}

	const additionalFields = ctx.getNodeParameter(
		'additionalFields',
		itemIndex,
		{},
	) as EnvelopeAdditionalFields;

	return applyAdditionalFields(definition, additionalFields);
}

function parseEnvelopeDefinitionJson(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const raw = ctx.getNodeParameter('envelopeDefinitionJson', itemIndex) as string | IDataObject;

	if (typeof raw === 'object' && raw !== null) {
		return raw;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(
			ctx.getNode(),
			`The envelope definition is not valid JSON: ${reason}`,
			{ itemIndex },
		);
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(ctx.getNode(), 'The envelope definition must be a JSON object.', {
			itemIndex,
		});
	}

	return parsed as IDataObject;
}
