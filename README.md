# n8n-nodes-docusign

[![npm version](https://img.shields.io/npm/v/@taurussoftware/n8n-nodes-docusign.svg)](https://www.npmjs.com/package/@taurussoftware/n8n-nodes-docusign)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An [n8n](https://n8n.io) community node for the **Docusign eSignature REST API v2.1**.

Send documents for signature, track envelopes, manage recipients and templates, download signed
PDFs, and start workflows from Docusign Connect webhooks.

- [Installation](#installation)
- [Credentials](#credentials)
  - [Which method should I use?](#which-method-should-i-use)
  - [OAuth2 setup](#oauth2-setup)
  - [JWT setup](#jwt-setup)
- [Operations](#operations)
- [Examples](#examples)
- [Docusign Trigger](#docusign-trigger)
- [Compatibility](#compatibility)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Resources](#resources)

## Installation

### In the n8n UI (self-hosted)

1. Go to **Settings → Community nodes**.
2. Select **Install a community node**.
3. Enter `@taurussoftware/n8n-nodes-docusign` and confirm.

### Manually

```bash
npm install @taurussoftware/n8n-nodes-docusign
```

Install it into your n8n custom extensions directory (`~/.n8n/custom` by default), then restart n8n.

## Credentials

The node ships two ways to authenticate. Both talk to the same API and produce identical requests —
they differ only in how the access token is obtained.

### Which method should I use?

| | **OAuth2** (Authorization Code) | **JWT** (Service Integration) |
|---|---|---|
| Setup effort | Low — click through a consent screen | Higher — RSA keypair plus one-time consent |
| Acts as | The person who authorised it | A user your app impersonates |
| Access token lifetime | 8 hours, refreshed automatically | 1 hour, minted on demand |
| Long idle periods | **Breaks after 30 days of inactivity** | Unaffected |
| Person leaves the company | **Breaks** | Unaffected (use a dedicated system user) |
| Best for | Getting started, interactive and regularly running workflows | Unattended production workflows |

**Use OAuth2 to get going, and switch to JWT before you depend on a workflow in production.**

Why the 30 day caveat matters: Docusign access tokens expire after 8 hours and n8n refreshes them
automatically when Docusign answers `401`. Because this node requests the `extended` scope, every
refresh extends the refresh token by another 30 days, so a workflow that runs at least monthly keeps
working indefinitely. A workflow that sits idle for longer than 30 days loses its refresh token, and
somebody has to reconnect the credential by hand. JWT has no refresh tokens at all and is therefore
immune to this.

Also note that concurrent executions can race: Docusign rotates the refresh token on every use, so
two executions refreshing at the same moment may invalidate each other's token. JWT avoids that too.

### OAuth2 setup

1. Sign up for a free [Docusign developer account](https://developers.docusign.com/).
2. In the Developer Center go to **Apps and Keys** and add an app.
3. In n8n create a **Docusign OAuth2 API** credential and copy the **OAuth Redirect URL** it shows.
4. Add that URL to your Docusign app under **Redirect URIs**.
5. Paste the app's **Integration Key** as the Client ID and generate a **Secret Key** for the
   Client Secret.
6. Leave **Environment** on `Demo` while you are developing.
7. Select **Connect my account** and approve the consent screen, then use **Test Connection**.

The credential requests the scopes `signature extended`. `extended` is what makes the refresh token
renewable — without it the connection has to be re-authorised by hand every 8 hours.

**Going live:** after Docusign approves your go-live request, switch **Environment** to
`Production` and reconnect. Demo and production are entirely separate accounts with separate
envelope IDs, which is the single most common source of `ENVELOPE_DOES_NOT_EXIST`.

### JWT setup

1. In the Developer Center open your app and, under **Authentication**, generate an **RSA keypair**.
   Copy the private key — Docusign shows it only once.
2. Note the **API Username** (a GUID) of the user the integration should act as. A dedicated system
   user is recommended so the integration does not break when a person leaves.
3. In n8n create a **Docusign JWT API** credential and fill in **Integration Key**, **User ID** and
   the **Private Key** (including the `-----BEGIN RSA PRIVATE KEY-----` lines).
4. Grant consent once. Either:
   - **Individually:** open the consent URL as that user and accept. If you skip this step the node
     tells you the exact URL to open, so you can simply run it once and follow the message.
   - **Administratively:** grant consent for the whole organisation in Docusign Admin, which
     requires an eligible plan and removes the per-user step.
5. Use **Test Connection**.

### Account selection

Docusign gives every account its own API host, so the node resolves the host through the
`/oauth/userinfo` endpoint and caches it for the duration of an execution. If the authenticated user
has several accounts, either leave **Account ID** empty to use their default account, or set it
explicitly. Setting both **Account ID** and **Account Base URL** skips the lookup entirely.

## Operations

### Envelope

| Operation | What it does |
|---|---|
| Create | Create an envelope from binary documents, from a template, or from a raw JSON definition — as a draft or sent immediately |
| Get | Get one envelope, optionally including recipients, documents, tabs or custom fields |
| Get Many | Search envelopes by status, date range, free text or envelope IDs |
| Send | Send a draft envelope to its recipients |
| Void | Void an envelope with a reason shown to the recipients |
| Resend | Resend the notification email to pending recipients |
| Get Form Data | Read the values recipients entered into form fields |
| Get Audit Events | Read the envelope audit trail |

### Envelope View

| Operation | What it does |
|---|---|
| Create Recipient View | Create an embedded signing URL for a captive recipient |
| Create Sender View | Create a URL for reviewing and sending a draft |
| Create Correct View | Create a URL for correcting a sent envelope |

### Envelope Document

| Operation | What it does |
|---|---|
| Get Many | List the documents in an envelope |
| Download | Download a document as binary — a single document, `combined`, `archive` (ZIP) or `certificate` |
| Add | Add or replace documents on an existing envelope |
| Delete | Remove documents from an envelope |

### Envelope Recipient

Get Many, Add, Update, Delete — including routing order, embedded signing via Client User ID, and
signature placement by anchor text or fixed coordinates.

### Envelope Custom Field

Get Many, Create, Update, Delete — for both text and list custom fields.

### Template

Get, Get Many, Get Documents, Get Recipients.

### Folder

Get Many, Get Items, Move Envelopes.

### User

Get, Get Many, Create, Update, Delete.

### Account

Get — account information, optionally with the full settings list.

## Examples

### Send a PDF for signature

1. Any node producing a binary PDF (**HTTP Request**, **Read/Write Files from Disk**, **Google
   Drive**, …).
2. **Docusign** → Resource `Envelope`, Operation `Create`:
   - **Source**: `Documents`
   - **Input Binary Field(s)**: `data`
   - **Status**: `Sent`
   - **Signers**: add one with a name, an email and **Signature Placement** `Anchor Text`
     (`/sig1/` by default — make sure that string appears in your PDF).

To position the signature without anchor text, switch **Signature Placement** to `Fixed Position`
and set the page and coordinates.

### Embedded signing in your own application

1. **Docusign** → `Envelope: Create`, with a signer that has a **Client User ID**. A recipient with
   a Client User ID receives no email and signs through a generated URL instead.
2. **Docusign** → `Envelope View: Create Recipient View`. Name, email and Client User ID must match
   the recipient on the envelope exactly.
3. The returned `url` is single-use and valid for a few minutes — redirect to it, do not store it.

To embed it in an iframe, set both **Frame Ancestors** and **Message Origins** in the options;
Docusign only accepts the focused view when both are present.

### React to a completed signature

1. **Docusign Trigger** → Events `Envelope Completed` (see [below](#docusign-trigger)).
2. **Docusign** → `Envelope Document: Download` with **Document ID** `combined` to fetch the signed
   PDF, or simply enable **Download Documents** on the trigger itself.
3. Archive it wherever you keep contracts.

## Docusign Trigger

The trigger receives [Docusign Connect](https://developers.docusign.com/platform/webhooks/connect/)
webhooks. It has two configuration modes.

### Manual mode (default)

You create the Connect configuration yourself, which needs no administrator credential in n8n.

1. Add the **Docusign Trigger** node and copy its **Production URL**. While testing, use the
   **Test URL** and keep the canvas open.
2. In Docusign go to **Settings → Connect** and add a **Custom** configuration.
3. Set **URL to Publish** to the copied URL.
4. Choose **JSON** as the data format with API version **restv2.1**. This node does not parse XML —
   see the note below.
5. Select the events you want, and enable **Include HMAC Signature** with a generated secret key.
6. In n8n create a **Docusign Connect HMAC API** credential and paste that secret.

Recipient-level events live in a separate Connect configuration of type **Custom Recipient**. If you
want both envelope and recipient events, create both configurations pointing at the same URL.

### Automatic mode

Set **Configuration Mode** to `Automatic` and pick a credential under **Authentication**. n8n then
creates the Connect configuration when you activate the workflow and removes it again when you
deactivate it, splitting envelope and recipient events into the two configurations Docusign requires.

Connect endpoints require an **account administrator**, so this fails with `USER_LACKS_PERMISSIONS`
for regular users. The HMAC secret itself still has to be generated in the Docusign UI and pasted
into the credential.

### Security

Keep **Verify HMAC Signature** enabled. The node computes HMAC-SHA256 over the raw request bytes,
compares it against every `x-docusign-signature-N` header in constant time, and answers `401`
without starting the workflow if none matches. With verification off, anyone who learns the webhook
URL can trigger your workflow with arbitrary data.

Events you did not select are acknowledged with `200` and ignored, so Docusign does not keep retrying
them.

> **JSON only.** The trigger deliberately does not support Connect's XML format: an XML parser would
> be a runtime dependency, and n8n does not allow those for verified community nodes. Select JSON
> (`restv2.1`) in your Connect configuration.

## Compatibility

- **Node.js** 22 or newer
- **n8n** 1.x with community nodes enabled
- **Docusign eSignature REST API** v2.1

The package has no runtime dependencies.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ENVELOPE_DOES_NOT_EXIST` for an envelope you can see in the UI | The credential points at the other environment. Demo and production are separate accounts — check **Environment**. |
| `consent_required` on a JWT credential | Consent has not been granted for the impersonated user. Run the operation once; the error message contains the exact URL to open. |
| `USER_LACKS_PERMISSIONS` | The operation needs an account administrator. This affects all Connect endpoints and most account-wide operations. |
| Credential worked for weeks, then stopped | An OAuth2 refresh token expires after 30 days without use. Reconnect the credential, and switch to JWT for workflows that run rarely. |
| Trigger answers 401 for every webhook | The HMAC secret in n8n does not match the one on the Connect configuration, or the configuration sends XML rather than JSON. |
| Trigger never fires | The Connect configuration points at the Test URL while the workflow is active, or the events you selected live in a Custom Recipient configuration you have not created. |
| `Select at least one event` when activating | Automatic mode needs at least one selected event. |
| Envelope created but nobody received an email | **Status** was left on `Created (Draft)`, or the recipient has a Client User ID and is therefore an embedded signer who gets no email. |

## Development

```bash
npm install
npm run dev            # starts n8n with this node loaded (needs Docker)
npm run lint           # n8n community node linter
npm test               # unit and integration tests
npm run test:coverage  # with coverage thresholds
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Docusign eSignature REST API reference](https://developers.docusign.com/docs/esign-rest-api/reference/)
- [Docusign authentication overview](https://developers.docusign.com/platform/auth/)
- [Docusign Connect webhooks](https://developers.docusign.com/platform/webhooks/connect/)

## License

[MIT](LICENSE)
