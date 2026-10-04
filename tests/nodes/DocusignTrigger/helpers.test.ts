import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
	buildConnectConfigurations,
	collectSignatures,
	computeSignature,
	deriveEventName,
	extractEnvelopeId,
	extractEventName,
	findConfigurationsForUrl,
	matchesEvents,
	resolveEventName,
	verifyHmacSignature,
} from '../../../nodes/DocusignTrigger/helpers';
import connectPayload from '../../fixtures/connect-envelope-completed.json';

const SECRET = 'super-secret-hmac-key';

function sign(body: string | Buffer, secret = SECRET): string {
	return createHmac('sha256', secret).update(body).digest('base64');
}

describe('computeSignature', () => {
	it('produces a base64 HMAC-SHA256 digest', () => {
		expect(computeSignature('payload', SECRET)).toBe(sign('payload'));
		expect(computeSignature('payload', SECRET)).toMatch(/^[A-Za-z0-9+/]+=*$/);
	});

	it('treats a Buffer and its string form identically', () => {
		expect(computeSignature(Buffer.from('payload'), SECRET)).toBe(
			computeSignature('payload', SECRET),
		);
	});
});

describe('collectSignatures', () => {
	it('collects every numbered signature header', () => {
		expect(
			collectSignatures({
				'x-docusign-signature-1': 'a',
				'x-docusign-signature-2': 'b',
				'content-type': 'application/json',
			}),
		).toEqual(['a', 'b']);
	});

	it('is case insensitive about header names', () => {
		expect(collectSignatures({ 'X-DocuSign-Signature-1': 'a' })).toEqual(['a']);
	});

	it('flattens a repeated header', () => {
		expect(collectSignatures({ 'x-docusign-signature-1': ['a', 'b'] })).toEqual(['a', 'b']);
	});

	it('ignores an unnumbered signature header', () => {
		expect(collectSignatures({ 'x-docusign-signature': 'a' })).toEqual([]);
	});

	it('returns nothing when no signature is present', () => {
		expect(collectSignatures({ 'content-type': 'application/json' })).toEqual([]);
	});
});

describe('verifyHmacSignature', () => {
	const rawBody = Buffer.from(JSON.stringify(connectPayload), 'utf8');

	it('accepts a matching signature', () => {
		expect(verifyHmacSignature(rawBody, SECRET, { 'x-docusign-signature-1': sign(rawBody) })).toBe(
			true,
		);
	});

	it('rejects a signature made with a different secret', () => {
		expect(
			verifyHmacSignature(rawBody, SECRET, {
				'x-docusign-signature-1': sign(rawBody, 'other-secret'),
			}),
		).toBe(false);
	});

	it('rejects a tampered body', () => {
		const signature = sign(rawBody);
		const tampered = Buffer.from(JSON.stringify({ ...connectPayload, event: 'envelope-voided' }));

		expect(verifyHmacSignature(tampered, SECRET, { 'x-docusign-signature-1': signature })).toBe(
			false,
		);
	});

	it('accepts when any one of several keys matches', () => {
		expect(
			verifyHmacSignature(rawBody, SECRET, {
				'x-docusign-signature-1': sign(rawBody, 'rotated-out'),
				'x-docusign-signature-2': sign(rawBody),
				'x-docusign-signature-3': 'garbage',
			}),
		).toBe(true);
	});

	it('rejects when no header is present', () => {
		expect(verifyHmacSignature(rawBody, SECRET, {})).toBe(false);
	});

	it('rejects when the secret is empty', () => {
		expect(verifyHmacSignature(rawBody, '', { 'x-docusign-signature-1': sign(rawBody, '') })).toBe(
			false,
		);
	});

	it('rejects a signature of a different length without throwing', () => {
		expect(() =>
			verifyHmacSignature(rawBody, SECRET, { 'x-docusign-signature-1': 'short' }),
		).not.toThrow();
		expect(verifyHmacSignature(rawBody, SECRET, { 'x-docusign-signature-1': 'short' })).toBe(false);
	});

	it('tolerates surrounding whitespace in the header', () => {
		expect(
			verifyHmacSignature(rawBody, SECRET, { 'x-docusign-signature-1': ` ${sign(rawBody)} ` }),
		).toBe(true);
	});

	it('hashes the exact bytes, so re-serialised JSON no longer matches', () => {
		// Whitespace is the realistic difference: parsing the request and
		// re-serialising it produces equivalent JSON with different bytes.
		const asSent = Buffer.from(JSON.stringify(connectPayload, null, 2), 'utf8');
		const reSerialised = Buffer.from(JSON.stringify(JSON.parse(asSent.toString('utf8'))), 'utf8');
		const signature = sign(asSent);

		expect(reSerialised.equals(asSent)).toBe(false);
		expect(verifyHmacSignature(asSent, SECRET, { 'x-docusign-signature-1': signature })).toBe(true);
		expect(verifyHmacSignature(reSerialised, SECRET, { 'x-docusign-signature-1': signature })).toBe(
			false,
		);
	});

	it('handles non-ASCII payloads byte-exactly', () => {
		const unicode = Buffer.from(JSON.stringify({ name: 'Müller – Straße 1' }), 'utf8');

		expect(verifyHmacSignature(unicode, SECRET, { 'x-docusign-signature-1': sign(unicode) })).toBe(
			true,
		);
	});

	it('is sensitive to key order, because the digest covers the raw text', () => {
		const first = Buffer.from(JSON.stringify({ a: 1, b: 2 }));
		const second = Buffer.from(JSON.stringify({ b: 2, a: 1 }));

		expect(verifyHmacSignature(second, SECRET, { 'x-docusign-signature-1': sign(first) })).toBe(
			false,
		);
	});
});

describe('extractEventName', () => {
	it('reads the event from the current JSON format', () => {
		expect(extractEventName(connectPayload)).toBe('envelope-completed');
	});

	it('returns undefined when there is no event field', () => {
		expect(extractEventName({ data: {} })).toBeUndefined();
		expect(extractEventName({ event: '' })).toBeUndefined();
		expect(extractEventName(undefined)).toBeUndefined();
	});
});

describe('matchesEvents', () => {
	it('matches a selected event', () => {
		expect(matchesEvents('envelope-completed', ['envelope-completed'])).toBe(true);
	});

	it('rejects an event that was not selected', () => {
		expect(matchesEvents('envelope-voided', ['envelope-completed'])).toBe(false);
	});

	it('accepts everything when nothing was selected', () => {
		expect(matchesEvents('envelope-voided', [])).toBe(true);
	});

	it('accepts a payload without an event name rather than dropping it', () => {
		expect(matchesEvents(undefined, ['envelope-completed'])).toBe(true);
	});
});

describe('extractEnvelopeId', () => {
	it('reads the ID from data.envelopeId', () => {
		expect(extractEnvelopeId(connectPayload)).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
	});

	it('falls back to the envelope summary', () => {
		expect(extractEnvelopeId({ data: { envelopeSummary: { envelopeId: 'from-summary' } } })).toBe(
			'from-summary',
		);
	});

	it('falls back to a top level envelopeId', () => {
		expect(extractEnvelopeId({ envelopeId: 'top-level' })).toBe('top-level');
	});

	it('returns undefined when no ID is present anywhere', () => {
		expect(extractEnvelopeId({ data: {} })).toBeUndefined();
		expect(extractEnvelopeId(undefined)).toBeUndefined();
	});
});

describe('buildConnectConfigurations', () => {
	const url = 'https://n8n.example.com/webhook/docusign';

	it('creates one envelope-level configuration for envelope events', () => {
		const payloads = buildConnectConfigurations(
			url,
			['envelope-sent', 'envelope-completed'],
			'n8n - Test',
			true,
		);

		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			configurationType: 'custom',
			name: 'n8n - Test',
			urlToPublishTo: url,
			deliveryMode: 'SIM',
			eventData: { version: 'restv2.1' },
			events: ['envelope-sent', 'envelope-completed'],
			includeHMAC: 'true',
		});
	});

	it('splits envelope and recipient events into separate configurations', () => {
		const payloads = buildConnectConfigurations(
			url,
			['envelope-completed', 'recipient-completed'],
			'n8n - Test',
			true,
		);

		expect(payloads.map((payload) => payload.configurationType)).toEqual([
			'custom',
			'customrecipient',
		]);
		expect(payloads[0].events).toEqual(['envelope-completed']);
		expect(payloads[1].events).toEqual(['recipient-completed']);
		expect(payloads[1].name).toBe('n8n - Test (recipients)');
	});

	it('creates only a recipient configuration for recipient-only events', () => {
		const payloads = buildConnectConfigurations(url, ['recipient-sent'], 'n8n', true);

		expect(payloads).toHaveLength(1);
		expect(payloads[0].configurationType).toBe('customrecipient');
	});

	it('turns HMAC off when verification is disabled', () => {
		const payloads = buildConnectConfigurations(url, ['envelope-completed'], 'n8n', false);

		expect(payloads[0].includeHMAC).toBe('false');
	});

	it('produces nothing when no events were selected', () => {
		expect(buildConnectConfigurations(url, [], 'n8n', true)).toEqual([]);
	});

	it('always requests JSON so the trigger does not receive XML', () => {
		const payloads = buildConnectConfigurations(url, ['envelope-completed'], 'n8n', true);

		expect(payloads[0].eventData).toEqual({ version: 'restv2.1' });
	});
});

describe('findConfigurationsForUrl', () => {
	const url = 'https://n8n.example.com/webhook/docusign';

	it('finds configurations pointing at the webhook URL', () => {
		expect(
			findConfigurationsForUrl(
				[
					{ connectId: '1', urlToPublishTo: url },
					{ connectId: '2', urlToPublishTo: 'https://elsewhere.test' },
				],
				url,
			),
		).toEqual(['1']);
	});

	it('also reads the urlToPublish spelling some responses use', () => {
		expect(findConfigurationsForUrl([{ connectId: '9', urlToPublish: url }], url)).toEqual(['9']);
	});

	it('returns all matches, e.g. the envelope and recipient pair', () => {
		expect(
			findConfigurationsForUrl(
				[
					{ connectId: '1', urlToPublishTo: url },
					{ connectId: '2', urlToPublishTo: url },
				],
				url,
			),
		).toEqual(['1', '2']);
	});

	it('skips entries without a connect ID', () => {
		expect(findConfigurationsForUrl([{ urlToPublishTo: url }], url)).toEqual([]);
	});

	it('returns nothing for an empty list', () => {
		expect(findConfigurationsForUrl([], url)).toEqual([]);
	});
});

describe('deriveEventName', () => {
	it('reads the status of the current payload layout', () => {
		expect(deriveEventName(connectPayload)).toBe('envelope-completed');
	});

	it('reads the status of the legacy envelopeStatus layout', () => {
		expect(deriveEventName({ envelopeStatus: { status: 'Voided' } })).toBe('envelope-voided');
	});

	it('reads a top-level status', () => {
		expect(deriveEventName({ status: 'declined' })).toBe('envelope-declined');
	});

	it('ignores case and surrounding whitespace', () => {
		expect(deriveEventName({ status: '  SENT ' })).toBe('envelope-sent');
	});

	it('maps every status the node offers as an envelope event', () => {
		const events = ['completed', 'declined', 'delivered', 'sent', 'voided'].map((status) =>
			deriveEventName({ status }),
		);

		expect(events).toEqual([
			'envelope-completed',
			'envelope-declined',
			'envelope-delivered',
			'envelope-sent',
			'envelope-voided',
		]);
	});

	it('invents nothing for a status that is not an offered event', () => {
		expect(deriveEventName({ status: 'created' })).toBeUndefined();
		expect(deriveEventName({ status: 'signed' })).toBeUndefined();
	});

	it('returns undefined when there is no status at all', () => {
		expect(deriveEventName({ envelopeId: 'env-1' })).toBeUndefined();
		expect(deriveEventName(undefined)).toBeUndefined();
	});
});

describe('resolveEventName', () => {
	it('prefers the event field over the status', () => {
		expect(resolveEventName({ event: 'recipient-sent', status: 'completed' })).toBe(
			'recipient-sent',
		);
	});

	it('falls back to the status when no event is named', () => {
		expect(resolveEventName({ envelopeStatus: { status: 'Completed' } })).toBe(
			'envelope-completed',
		);
	});

	it('stays undefined when neither is usable, so the filter lets the payload through', () => {
		const body = { envelopeId: 'env-1' };

		expect(resolveEventName(body)).toBeUndefined();
		expect(matchesEvents(resolveEventName(body), ['envelope-completed'])).toBe(true);
	});

	it('filters a legacy payload by its derived event, which it could not do before', () => {
		const voided = { envelopeStatus: { status: 'Voided' } };

		expect(matchesEvents(resolveEventName(voided), ['envelope-completed'])).toBe(false);
		expect(matchesEvents(resolveEventName(voided), ['envelope-voided'])).toBe(true);
	});
});
