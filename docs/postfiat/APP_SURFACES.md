# PFT Docs App Surfaces

This document maps user-facing surfaces to their current entry points and intended owner modules.

## Product Entry Points

| Surface | URL / Route | Current Owner | Target Owner |
| --- | --- | --- | --- |
| Wallet-first app shell | `/app/#docs` | `www/app/inner.js` | `www/app/postfiat/shell-view.js` |
| Documents | `/app/#docs` | `www/app/inner.js` | `www/app/postfiat/docs-view.js` |
| Shared documents | `/app/#shared` | `www/app/inner.js`, `www/common/drive-ui.js` | `www/app/postfiat/docs-view.js`, `www/common/postfiat-drive-hooks.js` |
| Sent shares | `/app/#sent` | `www/app/inner.js`, local browser state | `www/app/postfiat/docs-view.js`, share workflow modules |
| Wallet contacts | `/app/#contacts` | `www/app/inner.js`, `www/common/postfiat-private-share-contacts.js` | `www/app/postfiat/peer-messages.js`, contact hooks |
| Task Node | `/app/#tasknode` | `www/app/inner.js`, `src/postfiat/wallet-core.mjs` | `www/app/postfiat/tasknode-view.js`, `src/postfiat/tasknode/*` |
| Chat | `/app/#chat` | `www/app/inner.js` | `www/app/postfiat/chat-view.js`, `src/postfiat/chat/context-pack.mjs`, `src/postfiat/ai/providers.mjs` |
| Superthink | `/app/#superthink` | `www/app/inner.js` | `www/app/postfiat/superthink-view.js`, `src/postfiat/ai/superthink.mjs` |
| Peer messages | `/app/#messages` | `www/app/inner.js`, `src/postfiat/private-share-workflow.mjs` | `www/app/postfiat/peer-messages.js`, `src/postfiat/messages/*` |
| AI settings | `/app/#ai` | `www/app/inner.js` | `www/app/postfiat/chat-providers.js`, `www/app/postfiat/runpod-client.js` |
| RunPod Compute | `/app/#compute` | `www/app/inner.js`, `lib/http-worker.js` | `www/app/postfiat/runpod-view.js`, `www/app/postfiat/runpod-client.js`, `lib/postfiat/runpod-proxy.js` |
| Live document editor | `/pad/#/...`, `/doc/#/...` | upstream editor apps plus PFT share hooks | PFT shell wrapper around upstream editor where feasible |
| Wallet login | `/login/`, `/register/` | `www/common/common-login.js`, upstream pages | PFT-branded wallet-first login surfaces |

## Normal User Navigation

The normal PFT Docs navigation should expose:

- Documents
- Shared
- Sent
- Task Node
- Chat
- Superthink
- Messages
- AI
- RunPod
- Settings / wallet controls

The normal navigation should not expose:

- Legacy CryptPad view
- CryptDrive
- upstream account/password-first flows unless explicitly under advanced compatibility
- raw document capability links except advanced share controls

## Maintainer-Only / Internal Surfaces

These surfaces may retain upstream terminology because they exist to keep the fork operable:

- server deployment examples under `docs/`
- upstream admin/debug pages not linked from the PFT Docs shell
- source filenames such as `cryptpad-common.js`
- protocol identifiers and compatibility comments that are not rendered to users

## Route Ownership Rules

- `www/app/inner.js` should become a composition shell, not a feature owner.
- Route renderers belong in `www/app/postfiat/*-view.js`.
- Reusable parsing, packing, provider, crypto, and network logic belongs in `src/postfiat/*.mjs` or `lib/postfiat/*.js`.
- Browser-only state orchestration can stay in `www/app/postfiat/*.js`.

## Manual Smoke Paths

Use these after each large extraction:

1. Unlock a saved wallet and confirm `/app/#docs` opens.
2. Open a document and return to Documents.
3. Open Task Node and confirm cached task history renders.
4. Open Chat, select Context Doc and Tasks, send a small prompt.
5. Switch Chat provider to RunPod and verify readiness state.
6. Run Superthink with a small context.
7. Open Messages and send a Nostr peer message to a known test wallet.
8. Open AI settings and confirm saved provider keys are still detected.
