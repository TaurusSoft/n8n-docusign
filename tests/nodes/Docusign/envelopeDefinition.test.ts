import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import {
	applyAdditionalFields,
	buildEnvelopeDefinition,
	buildSigners,
	buildTemplateRoles,
} from '../../../nodes/Docusign/EnvelopeDefinition';
import { createExecuteFunctions } from '../../helpers/mockContexts';

describe('buildSigners', () => {
	it('numbers recipients sequentially when no ID was given', () => {
		const signers = buildSigners([
			{ name: 'Ada', email: 'ada@example.com' },
			{ name: 'Bob', email: 'bob@example.com' },
		]);

		expect(signers.map((signer) => signer.recipientId)).toEqual(['1', '2']);
	});

	it('keeps an explicit recipient ID', () => {
		const signers = buildSigners([{ name: 'Ada', email: 'a@e.com', recipientId: '42' }]);

		expect(signers[0].recipientId).toBe('42');
	});

	it('starts numbering at the given offset, e.g. when adding to an envelope', () => {
		const signers = buildSigners([{ name: 'Ada', email: 'a@e.com' }], 5);

		expect(signers[0].recipientId).toBe('5');
	});

	it('stringifies the routing order, as the API expects', () => {
		const signers = buildSigners([{ name: 'Ada', email: 'a@e.com', routingOrder: 3 }]);

		expect(signers[0].routingOrder).toBe('3');
	});

	it('defaults the routing order to 1', () => {
		expect(buildSigners([{ name: 'Ada', email: 'a@e.com' }])[0].routingOrder).toBe('1');
	});

	it('adds a clientUserId only for embedded signers', () => {
		const withId = buildSigners([{ name: 'A', email: 'a@e.com', clientUserId: 'c1' }]);
		const withoutId = buildSigners([{ name: 'A', email: 'a@e.com', clientUserId: '' }]);

		expect(withId[0].clientUserId).toBe('c1');
		expect(withoutId[0]).not.toHaveProperty('clientUserId');
	});

	it('anchors the signature tab by default', () => {
		const signers = buildSigners([{ name: 'A', email: 'a@e.com' }]);

		expect(signers[0].tabs).toEqual({
			signHereTabs: [
				{ anchorString: '/sig1/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' },
			],
		});
	});

	it('uses a custom anchor string and offsets', () => {
		const signers = buildSigners([
			{
				name: 'A',
				email: 'a@e.com',
				signaturePlacement: 'anchor',
				anchorString: '/signHere/',
				anchorXOffset: 10,
				anchorYOffset: -5,
			},
		]);

		expect(signers[0].tabs).toEqual({
			signHereTabs: [
				{
					anchorString: '/signHere/',
					anchorUnits: 'pixels',
					anchorXOffset: '10',
					anchorYOffset: '-5',
				},
			],
		});
	});

	it('places the tab at fixed coordinates when asked', () => {
		const signers = buildSigners([
			{
				name: 'A',
				email: 'a@e.com',
				signaturePlacement: 'position',
				documentId: '2',
				pageNumber: 3,
				xPosition: 120,
				yPosition: 400,
			},
		]);

		expect(signers[0].tabs).toEqual({
			signHereTabs: [{ documentId: '2', pageNumber: '3', xPosition: '120', yPosition: '400' }],
		});
	});

	it('omits tabs entirely when the document already carries them', () => {
		const signers = buildSigners([{ name: 'A', email: 'a@e.com', signaturePlacement: 'none' }]);

		expect(signers[0]).not.toHaveProperty('tabs');
	});
});

describe('buildTemplateRoles', () => {
	it('maps the role fields and stringifies the routing order', () => {
		const roles = buildTemplateRoles([
			{ roleName: 'Signer 1', name: 'Ada', email: 'ada@example.com', routingOrder: 2 },
		]);

		expect(roles).toEqual([
			{ roleName: 'Signer 1', name: 'Ada', email: 'ada@example.com', routingOrder: '2' },
		]);
	});

	it('adds a clientUserId for an embedded role', () => {
		const roles = buildTemplateRoles([
			{ roleName: 'R', name: 'A', email: 'a@e.com', clientUserId: 'c1' },
		]);

		expect(roles[0].clientUserId).toBe('c1');
	});
});

describe('applyAdditionalFields', () => {
	it('stringifies booleans, which is what an envelope definition expects', () => {
		const definition = applyAdditionalFields({}, {
			allowReassign: false,
			enableWetSign: true,
			envelopeIdStamping: false,
		});

		expect(definition).toEqual({
			allowReassign: 'false',
			enableWetSign: 'true',
			envelopeIdStamping: 'false',
		});
	});

	it('copies the optional text fields only when set', () => {
		expect(applyAdditionalFields({}, { emailBlurb: 'Hi', brandId: 'b1' })).toEqual({
			emailBlurb: 'Hi',
			brandId: 'b1',
		});
		expect(applyAdditionalFields({}, { emailBlurb: '', brandId: '' })).toEqual({});
	});

	it('builds an expiration notification', () => {
		const definition = applyAdditionalFields({}, { expireAfter: 14 });

		expect(definition.notification).toEqual({
			useAccountDefaults: 'false',
			expirations: { expireEnabled: 'true', expireAfter: '14', expireWarn: '0' },
		});
	});

	it('builds a reminder notification and defaults the missing half', () => {
		const definition = applyAdditionalFields({}, { reminderDelay: 5 });

		// Deliberate: Docusign has no way to override reminders while keeping the
		// account's expiration policy, so reminders alone leave the envelope with
		// no expiration at all. The field descriptions say so.
		expect(definition.notification).toEqual({
			useAccountDefaults: 'false',
			reminders: { reminderEnabled: 'true', reminderDelay: '5', reminderFrequency: '3' },
		});
		expect(definition.notification).not.toHaveProperty('expirations');
	});

	it('combines expiration and reminders in one notification block', () => {
		const definition = applyAdditionalFields({}, {
			expireAfter: 10,
			reminderDelay: 2,
			reminderFrequency: 4,
		});
		const notification = definition.notification as IDataObject;

		expect(notification).toHaveProperty('expirations');
		expect(notification).toHaveProperty('reminders');
	});

	it('adds no notification when neither was configured', () => {
		expect(applyAdditionalFields({}, {})).not.toHaveProperty('notification');
	});
});

describe('buildEnvelopeDefinition', () => {
	it('requires at least one signer for the documents source', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'documents',
				emailSubject: 'S',
				envelopeStatus: 'sent',
				binaryPropertyNames: 'data',
				signersUi: {},
				additionalFields: {},
			},
			binary: { data: { buffer: Buffer.from('x') } },
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).rejects.toThrow(
			/At least one signer is required/,
		);
	});

	it('requires at least one role for the template source', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'template',
				emailSubject: 'S',
				envelopeStatus: 'sent',
				templateId: 'tpl',
				templateRolesUi: {},
				additionalFields: {},
			},
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).rejects.toThrow(
			/At least one template role is required/,
		);
	});

	it('reports invalid JSON with the parser reason', async () => {
		const ctx = createExecuteFunctions({
			parameters: { source: 'json', envelopeDefinitionJson: '{not json' },
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).rejects.toThrow(/is not valid JSON/);
	});

	it('rejects a JSON array, which the API cannot accept', async () => {
		const ctx = createExecuteFunctions({
			parameters: { source: 'json', envelopeDefinitionJson: '[1,2]' },
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).rejects.toThrow(/must be a JSON object/);
	});

	it('rejects a JSON literal', async () => {
		const ctx = createExecuteFunctions({
			parameters: { source: 'json', envelopeDefinitionJson: '"text"' },
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).rejects.toThrow(/must be a JSON object/);
	});

	it('accepts an already-parsed object, as n8n hands over json parameters', async () => {
		const ctx = createExecuteFunctions({
			parameters: { source: 'json', envelopeDefinitionJson: { emailSubject: 'Object' } },
		});

		await expect(buildEnvelopeDefinition(ctx, 0)).resolves.toEqual({ emailSubject: 'Object' });
	});

	it('assembles multiple documents in the given order', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'documents',
				emailSubject: 'S',
				envelopeStatus: 'sent',
				binaryPropertyNames: 'first,second',
				signersUi: { signer: [{ name: 'A', email: 'a@e.com' }] },
				additionalFields: {},
			},
			binary: {
				first: { buffer: Buffer.from('1'), meta: { fileName: 'one.pdf' } },
				second: { buffer: Buffer.from('2'), meta: { fileName: 'two.pdf' } },
			},
		});

		const definition = await buildEnvelopeDefinition(ctx, 0);

		expect((definition.documents as IDataObject[]).map((doc) => doc.name)).toEqual([
			'one.pdf',
			'two.pdf',
		]);
	});

	it('keeps several signers with their routing order', async () => {
		const ctx = createExecuteFunctions({
			parameters: {
				source: 'documents',
				emailSubject: 'S',
				envelopeStatus: 'sent',
				binaryPropertyNames: 'data',
				signersUi: {
					signer: [
						{ name: 'A', email: 'a@e.com', routingOrder: 1 },
						{ name: 'B', email: 'b@e.com', routingOrder: 2 },
					],
				},
				additionalFields: {},
			},
			binary: { data: { buffer: Buffer.from('x') } },
		});

		const definition = await buildEnvelopeDefinition(ctx, 0);
		const signers = (definition.recipients as { signers: IDataObject[] }).signers;

		expect(signers.map((signer) => signer.routingOrder)).toEqual(['1', '2']);
	});
});
