# PFT Docs Refactor Burndown

This is the execution checklist for `docs/postfiat/REFACTOR_PLAN.md`.

Status values:

- `[x]` done
- `[~]` partially done
- `[ ]` not done

## Operating Rules

- Keep `main` clean before each refactor PR.
- One PR should either extract structure, add tests/docs, or change behavior. Avoid mixing all three.
- Preserve current behavior unless a task explicitly says product behavior should change.
- De-CryptPad user-facing product cleanup is allowed as behavior change because it removes confusing upstream UX.
- Do not rename upstream internal files just to remove the word CryptPad. User-facing copy comes first.
- Add tests around pure logic before moving high-risk parsing, crypto, provider, or cache code.
- Keep compatibility barrels during module splits so existing imports continue to work.

## Burn 0: Baseline And Inventory

- [x] Create `docs/postfiat/REFACTOR_PLAN.md`.
- [x] Capture current large-file inventory and target module boundaries.
- [x] Add explicit CryptPad product-surface removal plan.
- [x] Add `docs/postfiat/APP_SURFACES.md`.
- [x] Add `docs/postfiat/BRANDING_SURFACE.md`.
- [x] Add `docs/postfiat/DATA_CONTRACTS.md` skeleton.
- [x] Add `docs/postfiat/SECURITY_MODEL.md` skeleton or update existing security notes.
- [x] Add `docs/postfiat/ADR-0001-module-boundaries.md`.
- [x] Run `rg -n "CryptPad|cryptpad|CryptDrive|Legacy CryptPad|cryptpad.fr"` and classify every hit.
- [x] Create a blocked-copy allowlist for internal/maintainer-only CryptPad strings.

Done when:

- A new engineer can identify routes, storage keys, network endpoints, and owner modules without reading the 8k-line app file.
- Remaining CryptPad references are classified as replace, hide, maintainer-only, or internal.

## Burn 1: Test Harness And Fixtures

- [x] Create `scripts/tests/fixtures/postfiat/`.
- [x] Add fixture for decrypted Task Node event history.
- [ ] Add fixture for indexed Task Node snapshot history.
- [ ] Add fixture for chat context packing with recent and old tasks.
- [x] Add fixture for Ambient/OpenRouter/RunPod provider config.
- [x] Add fixture for RunPod `/v1/models` and booting/error states.
- [x] Add fixture for Superthink persona selector and final report input.
- [x] Add a simple test runner entry if existing `npm run test:postfiat` does not discover these tests.

Done when:

- `npm run test:postfiat` can run at least one new fixture-backed refactor test.
- The test fixtures do not contain private seeds, API keys, or user-secret material.

## Burn 2: Remove CryptPad From Normal User Flows

- [ ] Replace user-facing loading/interstitial copy with PFT Docs branding.
- [ ] Rebrand reachable login/register/recovery copy to PFT Docs/Post Fiat.
- [ ] Hide irrelevant upstream account/login options from normal wallet-first flows.
- [ ] Remove or hide "Legacy CryptPad view" from normal navigation.
- [x] Replace user-facing Drive/CryptDrive copy with Documents/Shared/Sent language.
- [ ] Replace upstream help/about/footer/title/meta strings with Post Fiat copy.
- [ ] Wrap common upstream error states with PFT Docs-specific copy.
- [x] Add blocked-copy scan script for user-facing CryptPad terms.
- [x] Add maintainer-only allowlist for internal filenames and upstream debug pages.
- [ ] Manually verify normal flows: login, app shell, docs list, editor open, share, chat, Task Node, RunPod.

Done when:

- Normal users do not see CryptPad branding, CryptDrive terminology, or legacy CryptPad entry points.
- Any remaining CryptPad string is internal, maintainer-only, or explicitly allowlisted.

## Burn 3: Extract Task Node Formatting

- [x] Create `www/app/postfiat/tasknode-format.js`.
- [x] Move pure task text extraction helpers out of `www/app/inner.js`.
- [x] Move task/reward/output grouping helpers out of `www/app/inner.js`.
- [x] Move collapsed verification/middle-preview formatting into the module.
- [x] Add `scripts/tests/postfiat-tasknode-format.test.js`.
- [x] Wire Task Node page rendering to imported formatting helpers.
- [x] Wire chat Task Node context packing to imported formatting helpers.
- [ ] Confirm no UI regression in task timeline, reward-first grouping, context-doc list, and copy buttons.

Done when:

- `renderTaskNodeWorkCard` and `buildTaskGroupChatBlock` use shared formatting helpers.
- `www/app/inner.js` is at least 400 lines smaller.

## Burn 4: Extract Chat Context, Memory, And Scroll State

- [x] Create `www/app/postfiat/chat-state.js`.
- [x] Move chat session, title, prompt-mode, and option normalization into `chat-state.js`.
- [x] Add `scripts/tests/postfiat-chat-state.test.js`.
- [x] Create `www/app/postfiat/chat-context.js`.
- [x] Create `www/app/postfiat/docs-data.js`.
- [ ] Create `src/postfiat/chat/context-pack.mjs`.
- [x] Move Drive document normalization and chat document text extraction into a module.
- [ ] Move selected document context section building into the module.
- [x] Move Task Node recent-context packing into the module.
- [x] Move historical task summary/relevance retrieval into the module.
- [x] Document chat memory/cache keys in `DATA_CONTRACTS.md`.
- [x] Add `scripts/tests/postfiat-chat-context.test.js`.
- [x] Add `scripts/tests/postfiat-docs-data.test.js`.
- [ ] Add `scripts/tests/postfiat-chat-context-pack.test.mjs`.
- [x] Keep raw recent tasks available while using summaries for older history.
- [ ] Fix chat scroll persistence so streaming does not jump to the top.

Done when:

- Chat context construction is fixture-tested outside the DOM.
- App view code orchestrates selected sources but does not own compression logic.

## Burn 5: Extract AI Provider Adapters

- [x] Create `www/app/postfiat/ai-providers.js`.
- [x] Move Ambient request payload helpers into provider adapter.
- [x] Move OpenRouter request payload and ZDR/provider config helpers into provider adapter.
- [x] Move RunPod OpenAI/Ollama request payload helpers into provider adapter.
- [x] Create `www/app/postfiat/odv.js`.
- [x] Move ODV prompt selection and `FULL RESPONSE |` extraction into `odv.js`.
- [x] Normalize ODV fallback behavior when a model omits the pipe delimiter.
- [x] Add `scripts/tests/postfiat-ai-provider-request.test.js`.

Done when:

- Provider payloads can be tested without rendering the chat UI.
- ODV streaming/fallback behavior is deterministic.

## Burn 6: Extract RunPod And Superthink

- [x] Create `www/app/postfiat/runpod-config.js`.
- [x] Move RunPod model/GPU presets and Ollama boot defaults into `runpod-config.js`.
- [x] Move RunPod pod payload construction into `runpod-config.js`.
- [x] Add `scripts/tests/postfiat-runpod-config.test.js`.
- [x] Create `www/app/postfiat/runpod-client.js`.
- [ ] Create `www/app/postfiat/runpod-view.js`.
- [ ] Share one RunPod readiness resolver across Chat and Superthink.
- [ ] Document RunPod pod lifecycle in `AI_PROVIDERS.md`.
- [x] Create `www/app/postfiat/superthink-engine.js`.
- [ ] Create `src/postfiat/ai/superthink.mjs`.
- [x] Move Superthink selector, persona-voice, manager, and final-report prompts into the module.
- [ ] Move Superthink round orchestration into the module.
- [ ] Make later rounds receive prior-round summary and prior persona names.
- [x] Enforce persona-specific rhetorical style without raising temperature.
- [x] Add `scripts/tests/postfiat-superthink-engine.test.js`.
- [ ] Add `scripts/tests/postfiat-superthink-prompt.test.mjs`.
- [ ] Add `scripts/tests/postfiat-runpod-readiness.test.mjs`.

Done when:

- Superthink has testable prompt contracts and less repetitive rounds.
- Chat and Superthink report the same RunPod ready/booting/stale endpoint states.

## Burn 7: Split PFT Docs Route Views

- [x] Create `www/app/postfiat/app-state.js`.
- [x] Create `www/app/postfiat/storage.js`.
- [ ] Create `www/app/postfiat/shell-view.js`.
- [ ] Create `www/app/postfiat/docs-view.js`.
- [ ] Create `www/app/postfiat/tasknode-view.js`.
- [ ] Create `www/app/postfiat/chat-view.js`.
- [ ] Create `www/app/postfiat/superthink-view.js`.
- [x] Create `www/app/postfiat/peer-messages.js`.
- [ ] Create `www/app/postfiat/wallet-session.js`.
- [ ] Move one route at a time and run `node --check www/app/inner.js` after each move.

Done when:

- Each major route has one renderer module.
- `www/app/inner.js` is under 2,500 lines before deeper cleanup.

## Burn 8: Split Styles

- [ ] Create `www/app/styles/`.
- [ ] Convert `www/app/app-postfiat.less` into an import manifest.
- [ ] Extract `tokens.less`.
- [ ] Extract `shell.less`.
- [ ] Extract `forms.less`.
- [ ] Extract `docs.less`.
- [ ] Extract `tasknode.less`.
- [ ] Extract `chat.less`.
- [ ] Extract `superthink.less`.
- [ ] Extract `runpod.less`.
- [ ] Extract `messages.less`.
- [ ] Extract `ai-settings.less`.
- [ ] Extract `wallet.less`.
- [ ] Extract `responsive.less` only for cross-route shell behavior.
- [ ] Verify desktop and mobile layouts for chat, Task Node, Superthink, RunPod, and docs.

Done when:

- No style file exceeds 500 lines.
- The chat streaming UI no longer flickers or overlaps status dots/thinking controls.

## Burn 9: Extract Server Post Fiat API

- [ ] Create `lib/postfiat/http-errors.js`.
- [ ] Create `lib/postfiat/pftl-proxy.js`.
- [ ] Move PFTL account transaction cache and RPC proxy out of `lib/http-worker.js`.
- [ ] Move IPFS gateway fetch out of `lib/http-worker.js`.
- [ ] Create `lib/postfiat/runpod-proxy.js`.
- [ ] Move RunPod REST proxy out of `lib/http-worker.js`.
- [ ] Move OpenAI-compatible/Ollama stream bridge out of `lib/http-worker.js`.
- [ ] Create `lib/postfiat/routes.js`.
- [ ] Mount Post Fiat routes from `lib/http-worker.js`.
- [ ] Add `scripts/tests/postfiat-http-runpod-proxy.test.js`.

Done when:

- `lib/http-worker.js` contains route mounting, not Post Fiat business logic.
- Server proxy validation has targeted tests.

## Burn 10: Split Wallet Core And Task Node History

- [ ] Create `src/postfiat/wallet/mnemonic.mjs`.
- [ ] Create `src/postfiat/wallet/vault.mjs`.
- [ ] Create `src/postfiat/wallet/session-wallet.mjs`.
- [ ] Create `src/postfiat/pft/payment.mjs`.
- [ ] Create `src/postfiat/tasknode/pointers.mjs`.
- [ ] Create `src/postfiat/tasknode/crypto.mjs`.
- [ ] Create `src/postfiat/tasknode/ipfs-cache.mjs`.
- [ ] Create `src/postfiat/tasknode/history.mjs`.
- [ ] Keep `src/postfiat/wallet-core.mjs` as compatibility barrel.
- [ ] Add fixtures for indexed pftasks snapshots.
- [ ] Add fixtures for on-chain pointer history.
- [ ] Verify wallet unlock, saved wallet, Task Node history, PFT balance, and PFT send flows.

Done when:

- Wallet derivation/session/vault code is isolated from Task Node history.
- Task Node history loading can be imported independently by future apps.

## Burn 11: Split Nostr Share And Peer Messaging

- [ ] Create `src/postfiat/nostr/nip44.mjs`.
- [ ] Create `src/postfiat/nostr/events.mjs`.
- [ ] Create `src/postfiat/nostr/giftwrap.mjs`.
- [ ] Keep `src/postfiat/nostr-private-share.mjs` as compatibility barrel.
- [ ] Create `src/postfiat/nostr/directory.mjs`.
- [ ] Create `src/postfiat/nostr/relay-policy.mjs`.
- [ ] Create `src/postfiat/share/live-pad-workflow.mjs`.
- [ ] Create `src/postfiat/messages/peer-chat-workflow.mjs`.
- [ ] Keep `src/postfiat/private-share-workflow.mjs` as compatibility barrel.
- [ ] Verify share-to-wallet, shared-with-me, peer message send, peer message receive, and directory fallback.

Done when:

- Directory records, relay policy, live-pad shares, and peer chat are independently testable.
- Unsupported directory record errors are normalized and actionable.

## Burn 12: Drive Hook Isolation

- [ ] Create `www/common/postfiat-drive-hooks.js`.
- [ ] Move PFT-specific shared-with-me entry rendering into hooks.
- [ ] Move Post Fiat inbox fetch/open logic into hooks.
- [ ] Move save-contact behavior into hooks.
- [ ] Keep `www/common/drive-ui.js` patch minimal and documented.
- [ ] Verify Shared, Sent, private share import, and document open flows.

Done when:

- PFT-specific Drive behavior can be reviewed without reading all of `drive-ui.js`.
- Future upstream merges are less likely to collide with PFT product logic.

## Burn 13: Final Validation And Release Gate

- [ ] Run `node --check www/app/inner.js`.
- [ ] Run checks for every new JS module touched by the refactor.
- [ ] Run `npm run build:postfiat`.
- [ ] Run `npm run build:postfiat-share`.
- [ ] Run `npm run postfiat:compress-static`.
- [ ] Run `npm run test:postfiat`.
- [ ] Manual desktop verification: login, docs, editor, share, chat, Task Node, Superthink, RunPod, peer messages.
- [ ] Manual mobile verification: login, docs, chat composer, Task Node timeline, generate/report surfaces.
- [ ] Manual Tor/onion verification if deploying to onion.
- [ ] Update `AGENT_HANDOFF.md` with the new module map and any remaining debt.

Done when:

- `www/app/inner.js` is under 1,500 lines.
- `www/app/app-postfiat.less` is an import manifest.
- Normal user flows are PFT Docs branded.
- Tests and builds pass.
- The app is easier to change than it was before the refactor.

## Suggested PR Order

1. Docs, fixtures, and branding inventory.
2. De-CryptPad normal user flows.
3. Task Node format extraction.
4. Chat context and memory extraction.
5. AI provider and ODV extraction.
6. RunPod and Superthink extraction.
7. Route view split.
8. Style split.
9. Server API extraction.
10. Wallet core split.
11. Nostr/share split.
12. Drive hook isolation.
13. Final validation and handoff.
