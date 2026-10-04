import { afterAll, afterEach, beforeAll } from 'vitest';

import { mswServer } from './helpers/msw';

// `error` so an unmocked request fails the test instead of escaping to the
// network and producing a confusing timeout.
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));

afterEach(() => mswServer.resetHandlers());

afterAll(() => mswServer.close());
