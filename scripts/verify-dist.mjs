#!/usr/bin/env node
/**
 * Checks that every node, credential and icon the package manifest promises is
 * actually present in `dist` after a build.
 *
 * A path typo here does not fail the build, it fails silently at load time
 * inside n8n, which is a far worse place to find out.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));

const declared = [...(packageJson.n8n?.nodes ?? []), ...(packageJson.n8n?.credentials ?? [])];

if (declared.length === 0) {
	console.error('package.json declares no nodes or credentials under "n8n".');
	process.exit(1);
}

const missing = declared.filter((relativePath) => !existsSync(resolve(projectRoot, relativePath)));

// Every node references the icons through a relative path, so they have to ship too.
const requiredAssets = ['dist/icons/docusign.svg', 'dist/icons/docusign.dark.svg'];
const missingAssets = requiredAssets.filter(
	(relativePath) => !existsSync(resolve(projectRoot, relativePath)),
);

// A node without its codex file loads, but shows up uncategorised in the UI.
const missingCodex = (packageJson.n8n?.nodes ?? [])
	.map((nodePath) => nodePath.replace(/\.js$/, '.json'))
	.filter((codexPath) => !existsSync(resolve(projectRoot, codexPath)));

const problems = [
	...missing.map((path) => `missing build output: ${path}`),
	...missingAssets.map((path) => `missing icon: ${path}`),
	...missingCodex.map((path) => `missing codex file: ${path}`),
];

if (problems.length > 0) {
	console.error('dist verification failed:');
	for (const problem of problems) {
		console.error(`  - ${problem}`);
	}
	process.exit(1);
}

console.log(`dist verification passed: ${declared.length} entries, ${requiredAssets.length} icons.`);
