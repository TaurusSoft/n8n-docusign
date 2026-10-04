import type { IDataObject } from 'n8n-workflow';

/**
 * Docusign never labels a recipient with its role. It groups recipients into one
 * array per role instead, so the array a recipient sits in *is* its type, and
 * these keys are the only complete list of recipient types there is.
 *
 * The order decides how `Get Many` returns a mixed envelope; signers first,
 * then the remaining roles.
 */
export const RECIPIENT_COLLECTIONS = {
	signers: 'signer',
	inPersonSigners: 'inPersonSigner',
	carbonCopies: 'carbonCopy',
	certifiedDeliveries: 'certifiedDelivery',
	agents: 'agent',
	editors: 'editor',
	intermediaries: 'intermediary',
	witnesses: 'witness',
	notaries: 'notary',
	seals: 'seal',
} as const;

export type RecipientCollection = keyof typeof RECIPIENT_COLLECTIONS;

export type RecipientType = (typeof RECIPIENT_COLLECTIONS)[RecipientCollection];

const COLLECTION_BY_TYPE = Object.fromEntries(
	Object.entries(RECIPIENT_COLLECTIONS).map(([collection, type]) => [type, collection]),
) as Record<RecipientType, RecipientCollection>;

/** Every recipient type, for the `Recipient Type` options and for error messages. */
export const RECIPIENT_TYPES = Object.values(RECIPIENT_COLLECTIONS);

/**
 * Flattens the grouped recipients of an envelope or template into one list,
 * tagging each entry with the type its group implies.
 *
 * Returns `undefined` when the payload carries no recipient group at all, which
 * is how callers tell "this envelope has no recipients" (an empty group) apart
 * from "this response does not describe recipients" (no group at all) and can
 * fall back to the raw payload for the latter.
 */
export function flattenRecipients(response: IDataObject | undefined): IDataObject[] | undefined {
	if (response === undefined) {
		return undefined;
	}

	const recipients: IDataObject[] = [];
	let sawCollection = false;

	for (const [collection, recipientType] of Object.entries(RECIPIENT_COLLECTIONS)) {
		const entries = response[collection];

		if (!Array.isArray(entries)) {
			continue;
		}

		sawCollection = true;

		for (const entry of entries as IDataObject[]) {
			recipients.push({ ...entry, recipientType });
		}
	}

	return sawCollection ? recipients : undefined;
}

/**
 * The array a write has to target for a recipient type.
 *
 * `undefined` for anything unknown: the UI offers a fixed list, but an
 * expression can still produce arbitrary values, and writing those to `signers`
 * would silently update the wrong recipient.
 */
export function collectionForRecipientType(
	recipientType: string | undefined,
): RecipientCollection | undefined {
	if (recipientType === undefined) {
		return undefined;
	}

	return COLLECTION_BY_TYPE[recipientType as RecipientType];
}
