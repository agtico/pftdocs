# PFT Docs Branding Surface

PFT Docs is the product. CryptPad is the fork substrate.

## User-Facing Allowed Terms

- PFT Docs
- Post Fiat
- Documents
- Shared
- Sent
- Wallet
- Task Node
- Chat
- Superthink
- RunPod
- AI
- Nostr
- PFTL
- IPFS, only when describing durable/publication behavior

## User-Facing Blocked Terms

These should not appear in normal user flows:

- CryptPad
- CryptDrive
- Legacy CryptPad view
- cryptpad.fr
- cryptpad.org
- CryptPad loading
- CryptPad account
- CryptPad login
- stock upstream help/about/donation copy

## Allowed Internal References

The blocked terms can remain in:

- SPDX copyright headers
- package dependencies or upstream repository metadata
- upstream filenames such as `cryptpad-common.js`
- CSS variable names such as `@cryptpad_text_col`
- JavaScript global compatibility names such as `window.CryptPad_updateLoadingProgress`
- maintainer docs that explicitly explain the fork or upstream substrate
- deployment examples that still describe upstream server mechanics
- advanced compatibility code comments

## Copy Ownership

| Copy Area | Owner File(s) |
| --- | --- |
| PFT Docs app shell labels | `www/app/inner.js`, target `www/app/postfiat/shell-view.js` |
| Task Node empty/loading/error states | `www/app/inner.js`, target `www/app/postfiat/tasknode-view.js` |
| Chat provider/key notices | `www/app/inner.js`, target `www/app/postfiat/chat-view.js` and `chat-providers.js` |
| RunPod lifecycle copy | `www/app/inner.js`, target `runpod-view.js` |
| Login/register wallet copy | `www/common/common-login.js`, `customize.dist/pages/login.js`, `customize.dist/pages/register.js` |
| Loading/interstitial copy | `customize.dist/loading.js`, `customize.dist/pre-loading.js`, `www/common/loading.js` |
| Translated upstream product names | `customize.dist/translations/messages.js` |

## Scanner Policy

The blocked-copy scanner should scan product-facing files, skip binary/compressed/generated files, and allow internal compatibility references. It should fail only on likely user-facing blocked terms, not on upstream source headers or internal symbol names.

Initial scan scope:

- `www/app/`
- `www/login/`
- `www/register/`
- `www/recovery/`
- `customize.dist/pages/`
- `customize.dist/translations/messages.js`
- `customize.dist/loading.js`
- `customize.dist/pre-loading.js`

Initial allowlist examples:

- SPDX headers
- `cryptpad-common.js` module paths
- `window.CryptPad_*` global names
- `postfiat://cryptpad` compatibility origin fallback
- `@cryptpad_*` style variables

## Done Criteria

Normal users can log in, load the app, open documents, use Task Node, use Chat, configure AI providers, and manage RunPod without seeing CryptPad, CryptDrive, or legacy CryptPad entry points.
