import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json';
import { operationRegistry } from '../../../nodes/Docusign/actions';
import { RECIPIENT_TYPES } from '../../../nodes/Docusign/RecipientCollections';
import { Docusign } from '../../../nodes/Docusign/Docusign.node';
import codex from '../../../nodes/Docusign/Docusign.node.json';

const node = new Docusign();
const { properties } = node.description;

function optionValues(property: INodeProperties): string[] {
	return (property.options as INodePropertyOptions[]).map((option) => String(option.value));
}

const resourceProperty = properties.find(
	(property) => property.name === 'resource',
) as INodeProperties;
const resources = optionValues(resourceProperty);

function operationProperty(resource: string): INodeProperties {
	const match = properties.find(
		(property) =>
			property.name === 'operation' && property.displayOptions?.show?.resource?.includes(resource),
	);

	if (match === undefined) {
		throw new Error(`No operation property declared for resource "${resource}"`);
	}

	return match;
}

/** Properties visible for a given resource and operation. */
function visibleProperties(resource: string, operation: string): INodeProperties[] {
	return properties.filter((property) => {
		const show = property.displayOptions?.show;

		if (show === undefined) {
			return true;
		}

		if (show.resource !== undefined && !show.resource.includes(resource)) {
			return false;
		}

		if (show.operation !== undefined && !show.operation.includes(operation)) {
			return false;
		}

		return true;
	});
}

describe('Docusign node description', () => {
	it('declares the fields n8n needs to render the node', () => {
		expect(node.description.displayName).toBe('Docusign');
		expect(node.description.name).toBe('docusign');
		expect(node.description.version).toBe(1);
		expect(node.description.subtitle).toBeTruthy();
		expect(node.description.defaults.name).toBe('Docusign');
	});

	it('is usable as an AI agent tool', () => {
		expect(node.description.usableAsTool).toBe(true);
	});

	it('references icons that exist in the package', () => {
		const icon = node.description.icon as { light: string; dark: string };

		expect(icon.light).toBe('file:../../icons/docusign.svg');
		expect(icon.dark).toBe('file:../../icons/docusign.dark.svg');
	});

	it('offers exactly the two authentication methods with OAuth2 as the default', () => {
		const property = properties.find((entry) => entry.name === 'authentication') as INodeProperties;

		expect(optionValues(property)).toEqual(['oAuth2', 'jwt']);
		expect(property.default).toBe('oAuth2');
	});

	it('binds each credential to its authentication choice', () => {
		expect(node.description.credentials).toEqual([
			{
				name: 'docusignOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
			{
				name: 'docusignJwtApi',
				required: true,
				displayOptions: { show: { authentication: ['jwt'] } },
			},
		]);
	});

	it('offers exactly the recipient types the handlers can address', () => {
		const property = properties.find((entry) => entry.name === 'recipientType') as INodeProperties;

		expect([...optionValues(property)].sort()).toEqual([...RECIPIENT_TYPES].sort());
		expect(property.default).toBe('signer');
	});

	it('lists the recipient type options alphabetically by name', () => {
		const property = properties.find((entry) => entry.name === 'recipientType') as INodeProperties;
		const names = (property.options as INodePropertyOptions[]).map((option) => option.name);

		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	it('lists the resource options alphabetically by name', () => {
		const names = (resourceProperty.options as INodePropertyOptions[]).map((option) => option.name);

		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
});

describe('description and handler registry agree', () => {
	it('declares an operation property for every resource', () => {
		for (const resource of resources) {
			expect(() => operationProperty(resource)).not.toThrow();
		}
	});

	it('has a handler for every operation offered in the UI', () => {
		for (const resource of resources) {
			for (const operation of optionValues(operationProperty(resource))) {
				expect(
					operationRegistry[resource]?.[operation],
					`missing handler for ${resource}.${operation}`,
				).toBeTypeOf('function');
			}
		}
	});

	it('offers every registered handler in the UI, so nothing is unreachable', () => {
		for (const [resource, handlers] of Object.entries(operationRegistry)) {
			expect(resources, `resource ${resource} is not offered`).toContain(resource);

			const declared = optionValues(operationProperty(resource));

			for (const operation of Object.keys(handlers)) {
				expect(declared, `operation ${resource}.${operation} is not offered`).toContain(operation);
			}
		}
	});

	it('covers every resource with at least one handler', () => {
		for (const resource of resources) {
			expect(Object.keys(operationRegistry[resource] ?? {}).length).toBeGreaterThan(0);
		}
	});
});

describe('operation options', () => {
	it('gives every operation a description and an action label', () => {
		for (const resource of resources) {
			for (const option of operationProperty(resource).options as INodePropertyOptions[]) {
				expect(option.description, `${resource}.${String(option.value)}`).toBeTruthy();
				expect(
					(option as { action?: string }).action,
					`${resource}.${String(option.value)}`,
				).toBeTruthy();
			}
		}
	});

	it('defaults to an operation that actually exists', () => {
		for (const resource of resources) {
			const property = operationProperty(resource);

			expect(optionValues(property)).toContain(String(property.default));
		}
	});

	it('marks every operation selector as not expression-driven', () => {
		for (const resource of resources) {
			expect(operationProperty(resource).noDataExpression).toBe(true);
		}
	});
});

describe('property hygiene', () => {
	it('never shows two properties with the same name at once', () => {
		for (const resource of resources) {
			for (const operation of optionValues(operationProperty(resource))) {
				const names = visibleProperties(resource, operation)
					.filter((property) => property.type !== 'notice')
					.map((property) => property.name);
				const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

				expect(duplicates, `${resource}.${operation} shows duplicates`).toEqual([]);
			}
		}
	});

	it('never offers a collection option that shadows a visible property', () => {
		for (const resource of resources) {
			for (const operation of optionValues(operationProperty(resource))) {
				const visible = visibleProperties(resource, operation);
				const names = visible.map((property) => property.name);

				for (const property of visible.filter((entry) => entry.type === 'collection')) {
					for (const option of (property.options ?? []) as INodeProperties[]) {
						const shownFor = option.displayOptions?.show?.operation;

						if (shownFor !== undefined && !shownFor.includes(operation)) {
							continue;
						}

						expect(
							names,
							`${resource}.${operation}: ${property.name}.${option.name} shadows a property`,
						).not.toContain(option.name);
					}
				}
			}
		}
	});

	it('shows at least one input besides the selectors for every operation', () => {
		for (const resource of resources) {
			for (const operation of optionValues(operationProperty(resource))) {
				const inputs = visibleProperties(resource, operation).filter(
					(property) =>
						!['authentication', 'resource', 'operation'].includes(property.name) &&
						property.type !== 'notice',
				);

				expect(inputs.length, `${resource}.${operation} has no inputs`).toBeGreaterThan(0);
			}
		}
	});

	it('only references resources that exist in displayOptions', () => {
		for (const property of properties) {
			for (const resource of property.displayOptions?.show?.resource ?? []) {
				expect(resources, `${property.name} references ${String(resource)}`).toContain(resource);
			}
		}
	});

	it('only references operations that exist for the referenced resource', () => {
		for (const property of properties) {
			const shownResources = property.displayOptions?.show?.resource ?? [];
			const shownOperations = property.displayOptions?.show?.operation ?? [];

			if (shownResources.length === 0 || shownOperations.length === 0) {
				continue;
			}

			const declared = shownResources.flatMap((resource) =>
				optionValues(operationProperty(String(resource))),
			);

			for (const operation of shownOperations) {
				expect(declared, `${property.name} references ${String(operation)}`).toContain(operation);
			}
		}
	});

	it('gives every option-type property a default that is one of its options', () => {
		const check = (property: INodeProperties, path: string) => {
			if (property.type === 'options' && Array.isArray(property.options)) {
				const values = optionValues(property);

				expect(values, `${path} default "${String(property.default)}"`).toContain(
					String(property.default),
				);
			}

			if (property.type === 'multiOptions') {
				expect(property.default, `${path} multiOptions default`).toEqual([]);
			}
		};

		for (const property of properties) {
			check(property, property.name);

			// collection / fixedCollection children
			for (const option of (property.options ?? []) as Array<
				INodeProperties & { values?: INodeProperties[] }
			>) {
				if (option.values !== undefined) {
					for (const child of option.values) {
						check(child, `${property.name}.${option.name}.${child.name}`);
					}
				} else if (option.type !== undefined) {
					check(option, `${property.name}.${option.name}`);
				}
			}
		}
	});

	it('only references loadOptions methods the node implements', () => {
		const implemented = Object.keys(node.methods.loadOptions);

		for (const property of properties) {
			const method = property.typeOptions?.loadOptionsMethod;

			if (method !== undefined) {
				expect(implemented, `${property.name} uses ${method}`).toContain(method);
			}
		}
	});

	it('pairs every limit field with the matching returnAll toggle', () => {
		for (const property of properties.filter((entry) => entry.name === 'limit')) {
			expect(property.displayOptions?.show?.returnAll).toEqual([false]);
			expect(property.typeOptions?.minValue).toBe(1);
		}
	});
});

describe('codex file', () => {
	it('names the node type as package name plus node name', () => {
		expect(codex.node).toBe(`${packageJson.name}.${node.description.name}`);
	});

	it('declares the fields the n8n UI reads', () => {
		expect(codex.codexVersion).toBe('1.0');
		expect(codex.nodeVersion).toBe('1.0');
		expect(codex.categories.length).toBeGreaterThan(0);
		expect(codex.resources.primaryDocumentation[0].url).toMatch(/^https:\/\//);
		expect(codex.resources.credentialDocumentation[0].url).toMatch(/^https:\/\//);
	});
});

describe('package manifest', () => {
	it('is named so n8n recognises it as a community node package', () => {
		expect(packageJson.name).toMatch(/^(@[^/]+\/)?n8n-nodes-/);
		expect(packageJson.keywords).toContain('n8n-community-node-package');
	});

	it('registers both nodes and all three credentials', () => {
		expect(packageJson.n8n.nodes).toEqual([
			'dist/nodes/Docusign/Docusign.node.js',
			'dist/nodes/DocusignTrigger/DocusignTrigger.node.js',
		]);
		expect(packageJson.n8n.credentials).toHaveLength(3);
	});

	it('declares no runtime dependencies, which node verification requires', () => {
		expect((packageJson as { dependencies?: Record<string, string> }).dependencies).toBeUndefined();
	});
});
