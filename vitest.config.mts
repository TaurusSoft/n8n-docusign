import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		setupFiles: ['tests/setup.ts'],
		fsModuleCache: true,
		coverage: {
			provider: 'v8',
			// `lcovonly` rather than `lcov`: the HTML report ships its own
			// JavaScript, which the n8n linter then reports on. The linter runs in
			// strict mode, so its config cannot be extended with an ignore pattern.
			reporter: ['text', 'lcovonly'],
			reportsDirectory: '.coverage',
			include: ['nodes/**/*.ts', 'credentials/**/*.ts', 'shared/**/*.ts'],
			thresholds: {
				lines: 90,
				statements: 90,
				functions: 90,
				branches: 85,
			},
		},
	},
});
