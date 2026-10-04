import { describe, expect, it } from 'vitest';

import {
	daysAgo,
	jsonItems,
	splitList,
	toDocusignDate,
} from '../../../../nodes/Docusign/actions/helpers';
import { operationRegistry } from '../../../../nodes/Docusign/actions';

describe('jsonItems', () => {
	it('wraps a single object as one item', () => {
		expect(jsonItems({ a: 1 }, 3)).toEqual([{ json: { a: 1 }, pairedItem: { item: 3 } }]);
	});

	it('wraps an array as one item each', () => {
		expect(jsonItems([{ a: 1 }, { a: 2 }], 0)).toEqual([
			{ json: { a: 1 }, pairedItem: { item: 0 } },
			{ json: { a: 2 }, pairedItem: { item: 0 } },
		]);
	});

	it('produces an empty object rather than an empty item for undefined', () => {
		expect(jsonItems(undefined, 0)).toEqual([{ json: {}, pairedItem: { item: 0 } }]);
	});

	it('produces nothing for an empty array', () => {
		expect(jsonItems([], 0)).toEqual([]);
	});
});

describe('splitList', () => {
	it('splits, trims and drops empty entries', () => {
		expect(splitList(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
	});

	it('returns an empty array for empty input', () => {
		expect(splitList('')).toEqual([]);
		expect(splitList(undefined)).toEqual([]);
	});

	it('handles a single value', () => {
		expect(splitList('only')).toEqual(['only']);
	});
});

describe('toDocusignDate', () => {
	it('normalises a date to ISO 8601', () => {
		expect(toDocusignDate('2026-01-15')).toBe('2026-01-15T00:00:00.000Z');
	});

	it('keeps an already-ISO timestamp', () => {
		expect(toDocusignDate('2026-01-15T10:30:00.000Z')).toBe('2026-01-15T10:30:00.000Z');
	});

	it('passes an unparseable value through rather than sending "Invalid Date"', () => {
		expect(toDocusignDate('not a date')).toBe('not a date');
	});

	it('returns undefined for empty input, so the filter is simply omitted', () => {
		expect(toDocusignDate('')).toBeUndefined();
		expect(toDocusignDate('   ')).toBeUndefined();
		expect(toDocusignDate(undefined)).toBeUndefined();
		expect(toDocusignDate(42)).toBeUndefined();
	});
});

describe('daysAgo', () => {
	it('subtracts whole days from the given moment', () => {
		expect(daysAgo(30, new Date('2026-03-31T12:00:00.000Z'))).toBe('2026-03-01T12:00:00.000Z');
	});

	it('returns the same moment for zero days', () => {
		expect(daysAgo(0, new Date('2026-03-31T12:00:00.000Z'))).toBe('2026-03-31T12:00:00.000Z');
	});
});

describe('operationRegistry', () => {
	it('maps every resource to a non-empty set of handler functions', () => {
		for (const [resource, handlers] of Object.entries(operationRegistry)) {
			expect(Object.keys(handlers).length, resource).toBeGreaterThan(0);

			for (const [operation, handler] of Object.entries(handlers)) {
				expect(handler, `${resource}.${operation}`).toBeTypeOf('function');
			}
		}
	});

	it('covers the nine resources the node offers', () => {
		expect(Object.keys(operationRegistry).sort()).toEqual([
			'account',
			'customField',
			'document',
			'envelope',
			'envelopeView',
			'folder',
			'recipient',
			'template',
			'user',
		]);
	});
});
