# PFT Docs Security Model

This is a working security model for refactor work. It is not a completed audit.

## Core Boundaries

- Wallet seed phrases must not be stored in plaintext.
- Saved wallets are encrypted locally and unlocked by a user password.
- Session wallet material is session-only and should not silently unlock unrelated wallets.
- CryptPad document content remains end-to-end encrypted inside the document engine.
- AI provider keys are browser-local settings, not document content.
- Any selected document/task/context plaintext sent to AI providers leaves the document E2E boundary.
- RunPod endpoints are user-configured infrastructure and should be treated as provider-facing plaintext sinks.
- Nostr relays do not receive document plaintext, but they can observe metadata such as timing, relay choice, event size, and sender network path.

## Secret Handling

| Secret | Expected Storage | Syncs Across Devices | Notes |
| --- | --- | --- | --- |
| Wallet mnemonic | never plaintext at rest | no | User input or encrypted vault only |
| Saved wallet vault | browser local storage | no | PBKDF2/AES-GCM encrypted |
| Session wallet | browser session storage / IndexedDB session key | no | Clears with session or explicit lock |
| Ambient/OpenRouter/RunPod keys | browser local storage | no | Not E2E document content |
| Document capability secrets | upstream encrypted document state / share payloads | yes only through intended sharing | Raw links are advanced compatibility |
| Nostr private keys derived from wallet | derived, not user-facing seed | no direct storage unless explicitly cached | Domain-separated from PFT signing key |

## Refactor Safety Requirements

- Preserve domain-separated signing messages.
- Keep wallet session code separate from Task Node history and AI provider code.
- Do not introduce global plaintext caches for decrypted task/document content.
- Keep per-wallet caches keyed by wallet address and versioned storage prefixes.
- Any cache that stores decrypted text must be local-only, explicitly documented, and removable.
- Do not make IPFS/PFTL publication the silent default for document sharing.
- Keep raw document capability link copy behind advanced compatibility UI.

## High-Risk Areas

- `www/common/outer/local-store.js`: wallet-derived login capability persistence.
- `src/postfiat/wallet-core.mjs`: currently owns wallet, Task Node crypto, and history.
- `www/app/inner.js`: currently assembles AI context and stores provider keys.
- `lib/http-worker.js`: currently proxies PFTL/IPFS/RunPod calls.
- Nostr directory records: incompatible records should produce actionable errors and not corrupt contacts.

## Required Tests

- wallet derivation and session vault tests;
- Task Node encrypted payload decrypt and hash mismatch tests;
- chat context packing tests that prove selected sources are explicit;
- AI provider request tests that prove keys are only sent to selected providers;
- RunPod proxy URL validation tests;
- Nostr private-share and peer-message event tests.
