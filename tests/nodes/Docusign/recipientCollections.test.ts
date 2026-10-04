import { describe, expect, it } from 'vitest';

import {
	RECIPIENT_COLLECTIONS,
	RECIPIENT_TYPES,
	collectionForRecipientType,
	flattenRecipients,
} from '../../../nodes/Docusign/RecipientCollections';

describe('flattenRecipients', () => {
	it('returns every recipient group Docusign can send, not just the signers', () => {
		const recipients = flattenRecipients({
			signers: [{ recipientId: '1' }],
			agents: [{ recipientId: '2' }],
			editors: [{ recipientId: '3' }],
			witnesses: [{ recipientId: '4' }],
			intermediaries: [{ recipientId: '5' }],
			notaries: [{ recipientId: '6' }],
			seals: [{ recipientId: '7' }],
		});

		expect(recipients?.map((recipient) => recipient.recipientId).sort()).toEqual([
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
		]);
	});

	it('tags each recipient with the role its group implies', () => {
		const recipients = flattenRecipients({
			signers: [{ recipientId: '1' }],
			carbonCopies: [{ recipientId: '2' }],
			certifiedDeliveries: [{ recipientId: '3' }],
		});

		expect(recipients).toEqual([
			{ recipientId: '1', recipientType: 'signer' },
			{ recipientId: '2', recipientType: 'carbonCopy' },
			{ recipientId: '3', recipientType: 'certifiedDelivery' },
		]);
	});

	it('keeps signers first and preserves the order inside a group', () => {
		const recipients = flattenRecipients({
			carbonCopies: [{ recipientId: 'cc-1' }, { recipientId: 'cc-2' }],
			signers: [{ recipientId: 's-1' }, { recipientId: 's-2' }],
		});

		expect(recipients?.map((recipient) => recipient.recipientId)).toEqual([
			's-1',
			's-2',
			'cc-1',
			'cc-2',
		]);
	});

	it('returns an empty list when a group is present but empty', () => {
		expect(flattenRecipients({ signers: [], carbonCopies: [] })).toEqual([]);
	});

	it('returns undefined when the payload describes no recipient group at all', () => {
		expect(flattenRecipients({ recipientCount: '0' })).toBeUndefined();
		expect(flattenRecipients(undefined)).toBeUndefined();
	});

	it('ignores a group that is not an array', () => {
		expect(flattenRecipients({ signers: 'nonsense' })).toBeUndefined();
	});
});

describe('collectionForRecipientType', () => {
	it('maps every known type back to the group it is written to', () => {
		for (const [collection, type] of Object.entries(RECIPIENT_COLLECTIONS)) {
			expect(collectionForRecipientType(type)).toBe(collection);
		}
	});

	it('refuses an unknown type instead of defaulting to the signers', () => {
		expect(collectionForRecipientType('signers')).toBeUndefined();
		expect(collectionForRecipientType('')).toBeUndefined();
		expect(collectionForRecipientType(undefined)).toBeUndefined();
	});
});

describe('RECIPIENT_TYPES', () => {
	it('lists one type per group, without duplicates', () => {
		expect(RECIPIENT_TYPES).toHaveLength(Object.keys(RECIPIENT_COLLECTIONS).length);
		expect(new Set(RECIPIENT_TYPES).size).toBe(RECIPIENT_TYPES.length);
	});
});
