import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import type { DocusignContext } from '../GenericFunctions';

export type OperationHandler = (
	ctx: IExecuteFunctions,
	itemIndex: number,
	context: DocusignContext,
) => Promise<INodeExecutionData[]>;

export type OperationRegistry = Record<string, Record<string, OperationHandler>>;

/** Wraps API results as node items, keeping the link back to the input item. */
export function jsonItems(
	data: IDataObject | IDataObject[] | undefined,
	itemIndex: number,
): INodeExecutionData[] {
	const rows = Array.isArray(data) ? data : [data ?? {}];

	return rows.map((row) => ({
		json: row ?? {},
		pairedItem: { item: itemIndex },
	}));
}

/** Splits a comma-separated parameter into trimmed, non-empty values. */
export function splitList(value: string | undefined): string[] {
	if (value === undefined || value === '') {
		return [];
	}

	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

/** Docusign expects `yyyy-MM-dd` or a full ISO timestamp; n8n hands us ISO strings. */
export function toDocusignDate(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}

	const parsed = new Date(value);

	return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** ISO timestamp of `days` ago, used as the implicit lower bound for envelope searches. */
export function daysAgo(days: number, now: Date = new Date()): string {
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
