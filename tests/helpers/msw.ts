import type { IHttpRequestOptions } from 'n8n-workflow';
import { setupServer } from 'msw/node';

export const mswServer = setupServer();

export const DEMO_OAUTH_BASE = 'https://account-d.docusign.com';
export const ACCOUNT_BASE_URL = 'https://demo.docusign.net';
export const ACCOUNT_ID = '11111111-2222-3333-4444-555555555555';
export const API_BASE_URL = `${ACCOUNT_BASE_URL}/restapi/v2.1/accounts/${ACCOUNT_ID}`;

/**
 * An `httpRequestWithAuthentication` replacement that performs a real HTTP
 * request, so msw can intercept it.
 *
 * This is what makes the integration tests exercise query serialisation, status
 * handling and binary decoding for real instead of asserting on a recorded call.
 */
export function createFetchingRequestHandler() {
	return async (_credentialType: string, options: IHttpRequestOptions): Promise<unknown> => {
		const url = new URL(options.url);

		for (const [key, value] of Object.entries(options.qs ?? {})) {
			url.searchParams.set(key, String(value));
		}

		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(options.headers ?? {})) {
			headers[key] = String(value);
		}

		let body: string | undefined;
		if (options.body !== undefined) {
			if (typeof options.body === 'string') {
				body = options.body;
			} else {
				body = JSON.stringify(options.body);
				headers['content-type'] = headers['content-type'] ?? 'application/json';
			}
		}

		const response = await fetch(url, {
			method: options.method ?? 'GET',
			headers,
			body,
		});

		if (!response.ok) {
			// Shaped like the axios error n8n surfaces, so the production error
			// mapping is exercised rather than bypassed.
			const errorBody = await response.text();
			throw Object.assign(new Error(`Request failed with status code ${response.status}`), {
				response: {
					status: response.status,
					body: safeJsonParse(errorBody),
				},
			});
		}

		if (options.encoding === 'arraybuffer') {
			const buffer = Buffer.from(await response.arrayBuffer());
			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			return options.returnFullResponse === true
				? { body: buffer, headers: responseHeaders, statusCode: response.status }
				: buffer;
		}

		const text = await response.text();
		const parsed = text === '' ? {} : safeJsonParse(text);

		if (options.returnFullResponse === true) {
			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			return { body: parsed, headers: responseHeaders, statusCode: response.status };
		}

		return parsed;
	};
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
