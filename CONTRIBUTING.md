# Contributing

Thanks for considering a contribution. This document covers how to get the project running, how the
code is organised, and what a pull request needs to be mergeable.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js 22 or newer** and npm
- **Docker or Podman** for `npm run dev`, which starts a real n8n instance. Use
  `npx n8n-node dev --external-n8n` if you already run n8n yourself.
- A free [Docusign developer account](https://developers.docusign.com/) for manual testing. Never
  test against a production Docusign account.

## Getting started

```bash
git clone https://github.com/TaurusSoft/n8n-docusign.git
cd n8n-docusign
npm install
npm test
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start n8n with this node loaded and rebuild on change |
| `npm run build` | Compile to `dist/` and copy icons and codex files |
| `npm run lint` | Run the n8n community node linter |
| `npm run lint:fix` | Fix what the linter can fix automatically |
| `npm test` | Run the whole test suite |
| `npm run test:watch` | Re-run tests on change |
| `npm run test:coverage` | Run tests and enforce coverage thresholds |
| `npm run typecheck` | Typecheck production code **and** tests |
| `npm run release` | Bump the version, write the changelog, tag and push |

## Project layout

```
credentials/          OAuth2, JWT and Connect HMAC credential classes
icons/                Node icons, referenced as file:../../icons/…
nodes/Docusign/
  Docusign.node.ts      description, loadOptions and the execute() router
  GenericFunctions.ts    request helpers, account resolution, pagination, errors
  EnvelopeDefinition.ts  builds an envelopeDefinition from the UI fields
  actions/               one module per resource, plus the operation registry
  descriptions/          one module per resource, pure UI definitions
nodes/DocusignTrigger/  webhook node, HMAC verification, Connect lifecycle
shared/                 helpers used by both credentials and nodes
scripts/                build verification used in CI
tests/                  see below
```

Three conventions matter:

1. **`GenericFunctions.ts` owns all HTTP access.** Nothing else calls
   `httpRequestWithAuthentication` directly. Account and base URL resolution happens once per
   execution and is passed down as a `DocusignContext`.
2. **Descriptions hold no logic.** They are plain data so the n8n linter can analyse them
   statically, which is also why properties are written out rather than generated in loops.
3. **Authentication is invisible below the router.** Only `getCredentialType()` knows which
   credential is in play; every handler is auth-agnostic, and a test asserts that both methods
   produce identical requests.

## Adding a resource or operation

The registry in `nodes/Docusign/actions/index.ts` and the UI description are checked against each
other by `tests/nodes/Docusign/description.test.ts`, so an operation cannot be half-added: the tests
fail if a handler has no UI entry or a UI entry has no handler.

To add an operation:

1. Add the option to the resource's `…Operations` array in `descriptions/`, with a `description` and
   an `action` label.
2. Add any new input properties, scoped with `displayOptions.show`.
3. Add the handler to the resource's module in `actions/` and register it in the exported map.
4. Add tests (see below).
5. Add a row to the operations table in [README.md](README.md).

For a new resource, also add it to the `resource` options in `Docusign.node.ts` (keep them
alphabetical), export the descriptions from `descriptions/index.ts`, and register the handler map in
`actions/index.ts`.

## Tests

The suite has two layers, and both matter:

**Unit tests** use a fake `IExecuteFunctions` from `tests/helpers/mockContexts.ts`. They assert the
exact request that would be sent — method, URL, query and body — and how the response maps onto
items. Every operation has at least a happy path and an error or edge case.

**Integration tests** in `tests/integration/` replace the request helper with one that performs a
real `fetch`, intercepted by [msw](https://mswjs.io/). These cover what a recorded call object
cannot: query serialisation, HTTP status handling, multi-page pagination and binary decoding.

### Adding tests for a new operation

1. Put any non-trivial API response in `tests/fixtures/` as JSON.
2. Add a unit test next to the other tests for that resource:

```ts
const ctx = createExecuteFunctions({
  parameters: { envelopeId: 'env-1', options: {} },
  responses: [myFixture],
});

await myHandlers.myOperation(ctx, 0, testDocusignContext);

expect(ctx.requests[0].options.method).toBe('GET');
expect(ctx.requests[0].options.url).toBe(`${API_BASE_URL}/my/endpoint`);
```

3. If the operation does anything interesting over the wire — pagination, binary data, an unusual
   status code — add an msw-backed case in `tests/integration/`.

Notes:

- `createExecuteFunctions` throws if a test reads a parameter the setup did not define. That is
  deliberate: it keeps a typo in a parameter name from silently passing.
- `responses` is a FIFO queue. An `Error` in the queue is thrown instead of returned, which is how
  error paths are tested.
- msw is configured with `onUnhandledRequest: 'error'`, so a request to an unmocked URL fails the
  test rather than reaching the network.
- Running the suite prints `Sourcemap for … points to missing source files` warnings. Those come
  from the sourcemaps published with `n8n-workflow` and are harmless.

### Coverage

`npm run test:coverage` enforces 90% statements, lines and functions, and 85% branches. Do not lower
the thresholds to make a change fit.

## Code style

ESLint and Prettier are configured through `@n8n/node-cli`, and the package runs in the linter's
strict mode — **do not modify `eslint.config.mjs`**, or linting will refuse to run. Run
`npm run lint:fix` before pushing.

Two plugins run on top of the usual TypeScript rules: `eslint-plugin-n8n-nodes-base` (UI and naming
conventions) and `@n8n/eslint-plugin-community-nodes` (packaging and correctness requirements).
Passing the linter is a prerequisite for submitting a node to n8n, so treat its findings as binding
rather than advisory. The rules that shaped this codebase:

- **`webhook-lifecycle-complete`** — a node that declares `webhooks` must implement `checkExists`,
  `create` **and** `delete` in `webhookMethods`. This is why the trigger has a Configuration Mode
  instead of being manual-only.
- **`credential-test-required`** — every credential needs a `test` request, or a `testedBy` method
  on a node that uses it. Credentials extending `oAuth2Api` are exempt. The Connect HMAC secret
  cannot be verified remotely, so it uses `testedBy` with a local check.
- **`require-node-api-error`** — a caught error may not be re-thrown as-is; wrap it in
  `NodeApiError` or `NodeOperationError`. `toDocusignError()` does this and passes existing node
  errors through unchanged. The rule also fires on `throw new Error(...)` inside a `catch`, which is
  why `shared/jwt.ts` records the failure and throws after the block.
- **`no-hardcoded-secrets`** — an identifier that looks secret-ish may not be assigned a long string
  literal, which is why credential type names are inlined rather than held in constants.
- **`no-runtime-dependencies`** — verified nodes ship no `dependencies`. Anything you need must come
  from `n8n-workflow` or the Node standard library.
- **`require-node-description-fields`** — `subtitle` and friends are mandatory on the description.
- **`cred-class-field-display-name-missing-api`** — a credential `displayName` must end in `API`.
- **`node-param-multi-options-type-unsorted-items`** — options are sorted alphabetically by `name`.
- **`node-param-description-*`** — descriptions start with an uppercase letter, and boolean
  parameters are described as "Whether …".

Run `npx eslint --print-config nodes/Docusign/Docusign.node.ts` to see the full rule set in effect.

Because the linter has no ignore pattern available in strict mode, keep generated output out of the
tree: coverage is written to `.coverage/lcov.info` only, with no HTML report, since the report's own
JavaScript would otherwise be linted.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
`test:`, `chore:`), which is what the changelog is generated from.

Before opening a pull request:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:coverage` passes
- [ ] `npm run build` succeeds and `node scripts/verify-dist.mjs` passes
- [ ] New or changed operations are covered by tests
- [ ] The operations table in the README is up to date
- [ ] Manually verified against a Docusign **demo** account, and the PR says what you tested

Never commit credentials, private keys, envelope IDs or account IDs. The JWT tests generate a
throwaway RSA keypair at runtime for exactly this reason — follow that pattern rather than checking
in a key.

## Releasing

Releases are cut from `main` and published by GitHub Actions so that the package carries
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), which n8n requires for
verified community nodes from 1 May 2026.

1. Make sure `main` is clean, up to date and green in CI.
2. Run `npm run release`. It lints, builds, bumps the version, updates `CHANGELOG.md`, commits, tags
   and pushes, and creates a GitHub release. It deliberately does **not** publish to npm.
3. The pushed tag triggers `.github/workflows/publish.yml`, which typechecks, tests, builds,
   verifies the tag matches `package.json`, and publishes with provenance.

The repository needs either npm Trusted Publishing configured for it, or an `NPM_TOKEN` secret.
Publishing from a developer machine is possible but produces no provenance, so avoid it.
