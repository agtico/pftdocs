# ADR-0001: Post Fiat Module Boundaries

## Status

Accepted for the refactor branch.

## Context

PFT Docs is a fork that still depends on upstream encrypted document internals. The product-specific code has grown inside large upstream-style files, especially `www/app/inner.js`, `www/app/app-postfiat.less`, `lib/http-worker.js`, and `src/postfiat/wallet-core.mjs`.

The result is difficult to review, difficult to test, and easy to regress.

## Decision

Use three module layers:

1. Browser view modules under `www/app/postfiat/*.js`.
2. Reusable product logic under `src/postfiat/**/*.mjs`.
3. Server Post Fiat proxy/API modules under `lib/postfiat/*.js`.

`www/app/inner.js` remains the AMD composition shell until the app has a bundling strategy for browser views. It should orchestrate modules, not own feature logic.

Compatibility barrels are allowed during extraction:

- `src/postfiat/wallet-core.mjs`
- `src/postfiat/private-share-workflow.mjs`
- `src/postfiat/nostr-private-share.mjs`

## Consequences

- We can test parsing, prompt, provider, Task Node, wallet, and RunPod logic without a DOM.
- Browser route rendering can be moved gradually without a big-bang rewrite.
- Upstream fork internals can remain named as they are, while user-facing PFT Docs behavior becomes clearly owned.
- Some duplication may temporarily exist while compatibility barrels are maintained.

## Non-Goals

- Rename every upstream file containing `cryptpad`.
- Replace the encrypted document engine.
- Introduce a new browser bundler for route views before the extraction proves value.
