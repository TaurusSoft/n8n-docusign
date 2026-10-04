# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `Envelope Recipient: Get Many` and `Template: Get Recipients` dropped recipients that were
  neither signers, in-person signers, carbon copies nor certified deliveries. Both now return every
  role Docusign can send, each tagged with `recipientType`.
- `Envelope Recipient: Update` always wrote to the `signers` group, so updating a carbon copy,
  certified delivery or in-person signer changed an unrelated recipient. The new **Recipient Type**
  field selects the group, and an unknown value fails the item instead of guessing.
- `Envelope Recipient: Add` numbered recipients from 1, colliding with the IDs an envelope already
  used. It now continues after the highest existing ID, looked up only when a recipient has no ID of
  its own. The new **First Recipient ID** option pins the numbering explicitly.

## [0.1.0] - 2026-09-18

Initial release.

### Added

- **Docusign node** covering the eSignature REST API v2.1 across nine resources:
  - *Envelope* — create (from binary documents, from a template, or from a raw JSON definition),
    get, get many with filters and pagination, send, void, resend, get form data, get audit events
  - *Envelope View* — recipient (embedded signing), sender and correct views
  - *Envelope Document* — get many, download (single, `combined`, `archive`, `certificate`), add,
    delete
  - *Envelope Recipient* — get many, add, update, delete
  - *Envelope Custom Field* — get many, create, update, delete, for text and list fields
  - *Template* — get, get many, get documents, get recipients
  - *Folder* — get many, get items, move envelopes
  - *User* — get, get many, create, update, delete
  - *Account* — get
- **Docusign Trigger node** for Docusign Connect webhooks, with HMAC-SHA256 signature verification
  over the raw request body, server-side event filtering, optional download of the signed documents,
  and a Connect configuration lifecycle that is either managed manually or created and removed
  through the API.
- **Credentials**
  - *Docusign OAuth2 API* — authorization code grant with the `signature extended` scopes, switchable
    between the demo and production hosts
  - *Docusign JWT API* — service integration using an RSA keypair, with RS256 assertions signed
    through Node's `crypto` and a consent URL built into the error message when consent is missing
  - *Docusign Connect HMAC API* — the shared secret used to verify webhooks
- Automatic resolution of the per-account API base URL through `/oauth/userinfo`, resolved once per
  execution, with optional manual overrides in the credential.
- Dynamic dropdowns for templates, folders and users.
- `usableAsTool` support, so the node can be used by AI agent nodes.

[Unreleased]: https://github.com/TaurusSoft/n8n-docusign/compare/0.1.0...HEAD
[0.1.0]: https://github.com/TaurusSoft/n8n-docusign/releases/tag/0.1.0
