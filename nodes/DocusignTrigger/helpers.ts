import { createHmac, timingSafeEqual } from 'crypto';
import type { IDataObject } from 'n8n-workflow';

/**
 * Docusign sends one signature header per active HMAC key, numbered from 1.
 * Only one of them has to match.
 */
const SIGNATURE_HEADER_PATTERN = /^x-docusign-signature-\d+$/;

export type WebhookHeaders = Record<string, string | string[] | undefined>;

/** Collects every `x-docusign-signature-N` header value. */
export function collectSignatures(headers: WebhookHeaders): string[] {
	const signatures: string[] = [];

	for (const [name, value] of Object.entries(headers)) {
		if (!SIGNATURE_HEADER_PATTERN.test(name.toLowerCase())) {
			continue;
		}

		if (Array.isArray(value)) {
			signatures.push(...value.filter((entry): entry is string => typeof entry === 'string'));
		} else if (typeof value === 'string') {
			signatures.push(value);
		}
	}

	return signatures;
}

/** Base64 HMAC-SHA256 of the raw request body. */
export function computeSignature(rawBody: Buffer | string, secret: string): string {
	return createHmac('sha256', secret).update(rawBody).digest('base64');
}

/**
 * Verifies a Docusign Connect HMAC signature.
 *
 * The digest must be taken over the exact bytes Docusign sent: parsing the JSON
 * and re-serialising it changes whitespace and key order and breaks the match.
 */
export function verifyHmacSignature(
	rawBody: Buffer | string,
	secret: string,
	headers: WebhookHeaders,
): boolean {
	const signatures = collectSignatures(headers);

	if (signatures.length === 0 || secret === '') {
		return false;
	}

	const expected = Buffer.from(computeSignature(rawBody, secret), 'utf8');

	return signatures.some((signature) => {
		const candidate = Buffer.from(signature.trim(), 'utf8');

		// timingSafeEqual throws on a length mismatch, which is itself a non-match.
		return candidate.length === expected.length && timingSafeEqual(candidate, expected);
	});
}

/**
 * Reads the event name out of a Connect payload.
 *
 * Only the current JSON format carries one, in `event`.
 */
export function extractEventName(body: IDataObject | undefined): string | undefined {
	const event = body?.event;

	return typeof event === 'string' && event !== '' ? event : undefined;
}

/** Envelope statuses that correspond to an event this node offers. */
const ENVELOPE_STATUS_EVENTS: Record<string, string> = {
	completed: 'envelope-completed',
	declined: 'envelope-declined',
	delivered: 'envelope-delivered',
	sent: 'envelope-sent',
	voided: 'envelope-voided',
};

/** The places a Connect payload can carry an envelope status, newest layout first. */
function collectEnvelopeStatuses(body: IDataObject | undefined): string[] {
	const data = body?.data as IDataObject | undefined;
	const summary = data?.envelopeSummary as IDataObject | undefined;
	const legacy = body?.envelopeStatus as IDataObject | undefined;

	return [summary?.status, legacy?.status, body?.status].filter(
		(status): status is string => typeof status === 'string' && status !== '',
	);
}

/**
 * Derives the event name from the envelope status, for the Connect formats that
 * carry no `event` field.
 *
 * Only statuses matching an event this node offers are mapped - anything else
 * stays undefined rather than inventing an event nobody could have selected.
 */
export function deriveEventName(body: IDataObject | undefined): string | undefined {
	for (const status of collectEnvelopeStatuses(body)) {
		const event = ENVELOPE_STATUS_EVENTS[status.trim().toLowerCase()];

		if (event !== undefined) {
			return event;
		}
	}

	return undefined;
}

/** The event a payload stands for, named outright or derived from its status. */
export function resolveEventName(body: IDataObject | undefined): string | undefined {
	return extractEventName(body) ?? deriveEventName(body);
}

/**
 * Empty selection means "every event", matching how n8n treats unset filters.
 *
 * A payload whose event cannot be determined at all passes too. Dropping it
 * would be the stricter reading of the filter, but a webhook that vanishes
 * without an execution is far harder to diagnose than one event too many, so
 * the Events field says this outright.
 */
export function matchesEvents(eventName: string | undefined, selectedEvents: string[]): boolean {
	if (selectedEvents.length === 0) {
		return true;
	}

	if (eventName === undefined) {
		return true;
	}

	return selectedEvents.includes(eventName);
}

/**
 * Builds the Connect configuration payloads for the automatic mode.
 *
 * Docusign keeps envelope-level and recipient-level subscriptions in separate
 * configurations, so a selection spanning both produces two payloads.
 */
export function buildConnectConfigurations(
	webhookUrl: string,
	events: string[],
	name: string,
	includeHmac: boolean,
): IDataObject[] {
	const envelopeEvents = events.filter((event) => event.startsWith('envelope-'));
	const recipientEvents = events.filter((event) => event.startsWith('recipient-'));

	const payloads: IDataObject[] = [];

	if (envelopeEvents.length > 0) {
		payloads.push(
			connectConfiguration(webhookUrl, envelopeEvents, name, includeHmac, 'custom'),
		);
	}

	if (recipientEvents.length > 0) {
		payloads.push(
			connectConfiguration(
				webhookUrl,
				recipientEvents,
				`${name} (recipients)`,
				includeHmac,
				'customrecipient',
			),
		);
	}

	return payloads;
}

function connectConfiguration(
	webhookUrl: string,
	events: string[],
	name: string,
	includeHmac: boolean,
	configurationType: 'custom' | 'customrecipient',
): IDataObject {
	return {
		configurationType,
		name,
		urlToPublishTo: webhookUrl,
		allUsers: 'true',
		allowEnvelopePublish: 'true',
		enableLog: 'true',
		requiresAcknowledgement: 'true',
		deliveryMode: 'SIM',
		includeHMAC: includeHmac ? 'true' : 'false',
		integratorManaged: 'true',
		// restv2.1 is what makes Docusign deliver JSON instead of XML.
		eventData: { version: 'restv2.1' },
		events,
	};
}

/** IDs of the Connect configurations already pointing at a given webhook URL. */
export function findConfigurationsForUrl(
	configurations: IDataObject[],
	webhookUrl: string,
): string[] {
	return configurations
		.filter((configuration) => {
			const url = configuration.urlToPublishTo ?? configuration.urlToPublish;

			return typeof url === 'string' && url === webhookUrl;
		})
		.map((configuration) => String(configuration.connectId ?? ''))
		.filter((connectId) => connectId !== '');
}

/** Pulls the envelope ID out of a Connect payload, across both JSON layouts. */
export function extractEnvelopeId(body: IDataObject | undefined): string | undefined {
	const data = body?.data as IDataObject | undefined;
	const fromData = data?.envelopeId;

	if (typeof fromData === 'string' && fromData !== '') {
		return fromData;
	}

	const summary = data?.envelopeSummary as IDataObject | undefined;
	const fromSummary = summary?.envelopeId;

	if (typeof fromSummary === 'string' && fromSummary !== '') {
		return fromSummary;
	}

	const topLevel = body?.envelopeId;

	return typeof topLevel === 'string' && topLevel !== '' ? topLevel : undefined;
}
