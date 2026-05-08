# PFT Docs Refactor Plan

## Purpose

The current PFT Docs app is useful but too much of the product lives in a few large files. That makes every feature feel risky, hides the real product contracts, and makes it hard to distinguish stable tooling from prototype glue.

The goal is not a rewrite. The goal is to turn the working app into maintainable tooling by extracting owned Post Fiat logic from CryptPad surfaces, documenting the data contracts, removing stale CryptPad-facing product concepts, and adding tests around seams before moving code.

## Baseline Hotspots

Line counts captured before this refactor branch started, excluding obvious vendored components and compressed static assets:

| File | Lines | Classification | Refactor Priority |
| --- | ---: | --- | --- |
| `www/app/inner.js` | 8,941 | Main PFT Docs app: state, routing, wallet, Task Node, chat, RunPod, Superthink, Nostr messages, rendering | Critical |
| `www/common/drive-ui.js` | 6,099 | CryptPad drive UI with PFT hooks mixed in | High, but isolate carefully |
| `www/form/inner.js` | 5,946 | CryptPad form app, mostly upstream surface | Low |
| `www/common/common-ui-elements.js` | 4,768 | Shared CryptPad UI primitives | Low unless PFT branding leaks |
| `www/admin/inner.js` | 4,253 | CryptPad admin surface | Low |
| `www/common/cryptpad-common.js` | 2,895 | CryptPad common layer | Low, avoid unless needed |
| `www/common/sframe-common-outer.js` | 2,889 | CryptPad outer frame plus wallet integration hooks | Medium |
| `www/app/app-postfiat.less` | 2,572 | PFT Docs styles for every route | Critical |
| `lib/http-worker.js` | 2,089 | HTTP worker plus PFTL/IPFS/RunPod proxy endpoints | High |
| `src/postfiat/wallet-core.mjs` | 1,980 | Wallet, vault, PFT payments, Task Node pointer/decryption/history loading | High |
| `src/postfiat/private-share-workflow.mjs` | 694 | Nostr directory, live-pad share, peer chat workflow | Medium |
| `src/postfiat/nostr-private-share.mjs` | 580 | NIP-44/NIP-59 event crypto helpers | Medium |

Vendor/generated files such as `www/lib/pdfjs/**`, `customize.dist/lucide.js`, bundled `.bundle.js`, and compressed `.gz/.br` files should not drive refactor work.

## First Tranche Status

The first extraction tranche on `refactor/pftdocs-tooling` moved pure browser logic out of `www/app/inner.js` and into tested AMD modules:

| Module | Responsibility |
| --- | --- |
| `www/app/postfiat/app-state.js` | route labels, route normalization, boot hash parsing |
| `www/app/postfiat/storage.js` | browser JSON storage and bridge/local migration behavior |
| `www/app/postfiat/tasknode-format.js` | Task Node text extraction, grouping, reward/output formatting |
| `www/app/postfiat/chat-state.js` | chat session, title, option, and prompt-mode normalization |
| `www/app/postfiat/chat-context.js` | Task Node chat context packing: recent raw detail plus older summaries/relevance retrieval |
| `www/app/postfiat/ai-providers.js` | Ambient/OpenRouter/RunPod request payload construction |
| `www/app/postfiat/odv.js` | ODV prompt text and `FULL RESPONSE` extraction/fallback behavior |
| `www/app/postfiat/runpod-config.js` | RunPod model/GPU presets, Ollama boot defaults, pod payload construction |
| `www/app/postfiat/superthink-engine.js` | Superthink persona parsing, voice contracts, prompt construction, transcript/final report helpers |
| `www/app/postfiat/peer-messages.js` | Nostr peer-message state normalization, recipient parsing, conversation upsert/append behavior |

Current first-tranche line counts:

| File | Lines |
| --- | ---: |
| `www/app/inner.js` | 7,718 |
| `www/app/postfiat/*.js` | 1,689 |
| `www/app/app-postfiat.less` | 2,572 |
| `lib/http-worker.js` | 2,089 |
| `src/postfiat/wallet-core.mjs` | 1,980 |

## Refactor Principles

1. No big-bang rewrite.
2. Extract pure logic before render logic.
3. Preserve necessary CryptPad fork/protocol integration points, but remove CryptPad as a user-facing product concept.
4. Keep browser-facing view modules AMD/RequireJS-compatible unless we explicitly add a bundle.
5. Keep reusable product logic in `src/postfiat/*.mjs` and bundle it only where browser code needs it.
6. Add fixture tests before moving code that parses wallet, Task Node, Nostr, AI, or RunPod data.
7. Every extracted module gets a short header comment describing ownership, inputs, outputs, and storage/network side effects.
8. Every new data contract gets a doc section and at least one sample fixture.
9. User-facing labels, loading screens, login surfaces, help text, legacy links, and error states should say PFT Docs/Post Fiat unless the text is explicitly describing upstream internals for maintainers.

## Target Module Boundaries

### `www/app/inner.js`

Current problem: one file owns everything from local storage to AI provider calls to DOM rendering.

Target split:

| New Module | Responsibility |
| --- | --- |
| `www/app/postfiat/app-state.js` | APP shape, route labels, route normalization, high-level state initialization |
| `www/app/postfiat/storage.js` | Browser local/session storage helpers, JSON read/write, key preservation rules |
| `www/app/postfiat/wallet-session.js` | Wallet session RPC, unlock/lock/switch flows, active wallet address |
| `www/app/postfiat/tasknode-format.js` | Task Node text extraction, task grouping, reward/task/output formatting |
| `www/app/postfiat/tasknode-view.js` | Task Node route rendering only |
| `www/app/postfiat/chat-state.js` | Chat sessions, titles, deletion, scroll state |
| `www/app/postfiat/chat-context.js` | Context doc/task packing, historical task cache, relevant older task selection |
| `www/app/postfiat/chat-providers.js` | Ambient, OpenRouter, RunPod request adapters and error normalization |
| `www/app/postfiat/chat-view.js` | Chat rail, messages, composer, source toggles |
| `www/app/postfiat/odv.js` | ODV prompt, streaming extraction, pipe delimiter handling |
| `www/app/postfiat/runpod-config.js` | RunPod model/GPU presets, pod payload construction, Ollama boot defaults |
| `www/app/postfiat/runpod-client.js` | RunPod key, pod list/create/stop/delete, readiness probing |
| `www/app/postfiat/runpod-view.js` | RunPod Compute and AI RunPod settings UI |
| `www/app/postfiat/superthink-engine.js` | Persona selection, voice contracts, rounds, final report prompts |
| `www/app/postfiat/superthink-view.js` | Superthink page rendering |
| `www/app/postfiat/peer-messages.js` | Nostr peer chat state, recipient parsing, payments |
| `www/app/postfiat/docs-view.js` | Document list/search/create/open/share shell |
| `www/app/postfiat/shell-view.js` | Sidebar/topbar/routing chrome |

Success condition: `www/app/inner.js` becomes a composition shell under 1,500 lines.

### `www/app/app-postfiat.less`

Current problem: one stylesheet owns shell, docs, chat, Task Node, Superthink, RunPod, messages, AI settings, responsive, and utility classes.

Target split:

```text
www/app/styles/
  app-postfiat.less          # import manifest only
  tokens.less                # colors, spacing, typography, common variables
  shell.less                 # sidebar/topbar/content layout
  forms.less                 # inputs, buttons, panels
  docs.less
  tasknode.less
  chat.less
  superthink.less
  runpod.less
  messages.less
  ai-settings.less
  wallet.less
  responsive.less
```

Success condition: `app-postfiat.less` is an import manifest and no section file exceeds 500 lines.

### `lib/http-worker.js`

Current problem: Post Fiat proxy/API code is embedded inside the CryptPad HTTP worker.

Target split:

| New Module | Responsibility |
| --- | --- |
| `lib/postfiat/http-errors.js` | `makePostFiatHttpError`, JSON response helpers |
| `lib/postfiat/pftl-proxy.js` | PFTL account-tx cache, RPC proxy, IPFS gateway fetch |
| `lib/postfiat/runpod-proxy.js` | RunPod REST API proxy, OpenAI-compatible proxy, Ollama stream bridge |
| `lib/postfiat/routes.js` | Route registration function mounted by `http-worker.js` |

Success condition: `http-worker.js` only mounts Post Fiat routes and keeps CryptPad upstream behavior readable.

### `src/postfiat/wallet-core.mjs`

Current problem: wallet derivation, session vault, PFT payment construction, Task Node crypto, IPFS cache, indexed history loading, and account-tx history loading all share one module.

Target split:

| New Module | Responsibility |
| --- | --- |
| `src/postfiat/wallet/mnemonic.mjs` | BIP39 normalization, wallet derivation, message signing |
| `src/postfiat/wallet/vault.mjs` | saved wallet vault encryption/decryption |
| `src/postfiat/wallet/session-wallet.mjs` | IndexedDB non-extractable session key and sessionStorage encrypted wallet |
| `src/postfiat/pft/payment.mjs` | native PFT balance/payment transaction helpers |
| `src/postfiat/tasknode/pointers.mjs` | pf.ptr memo decode and event extraction |
| `src/postfiat/tasknode/crypto.mjs` | X25519 key derivation, payload encrypt/decrypt |
| `src/postfiat/tasknode/ipfs-cache.mjs` | browser IPFS JSON cache |
| `src/postfiat/tasknode/history.mjs` | indexed snapshot normalization and account-tx history loading |
| `src/postfiat/wallet-core.mjs` | compatibility barrel re-exporting the public API |

Success condition: existing imports still work through the barrel, while tests can target smaller modules.

### `src/postfiat/private-share-workflow.mjs`

Current problem: directory records, live pad shares, peer chat, relay selection, publish, fetch, and open/decrypt are one workflow.

Target split:

| New Module | Responsibility |
| --- | --- |
| `src/postfiat/nostr/directory.mjs` | inbox directory record build/parse/publish/fetch |
| `src/postfiat/nostr/relay-policy.mjs` | relay selection and fallback policy |
| `src/postfiat/share/live-pad-workflow.mjs` | live pad private share build/open/fetch |
| `src/postfiat/messages/peer-chat-workflow.mjs` | peer chat payload build/open/fetch/publish |
| `src/postfiat/private-share-workflow.mjs` | compatibility barrel |

### `src/postfiat/nostr-private-share.mjs`

Current problem: NIP-44 crypto, NIP-01 signing, NIP-59 wrapping, live-pad envelope helpers in one file.

Target split:

| New Module | Responsibility |
| --- | --- |
| `src/postfiat/nostr/nip44.mjs` | conversation key, padding, encrypt/decrypt |
| `src/postfiat/nostr/events.mjs` | event serialization, id, signing, verification |
| `src/postfiat/nostr/giftwrap.mjs` | seal/gift-wrap build/open |
| `src/postfiat/nostr-private-share.mjs` | compatibility barrel |

### `www/common/drive-ui.js`

Current problem: core CryptPad Drive and PFT share/inbox hooks are mixed.

Do not start by refactoring Drive itself. First extract PFT-specific operations into:

```text
www/common/postfiat-drive-hooks.js
```

That module should expose functions such as:

- `renderSharedWithMeEntry`
- `fetchPostFiatInbox`
- `openPostFiatShare`
- `savePostFiatContact`

Success condition: future Drive upstream merges are less painful because PFT logic is contained behind hooks.

## CryptPad Product Surface Removal

The app can remain a fork internally, but the product should not expose CryptPad terminology, branding, account flows, loading screens, or legacy escape hatches to normal users. CryptPad is now an implementation substrate, not the product.

### User-Facing Rule

Allowed in user-facing UI:

- PFT Docs
- Post Fiat
- Documents
- Shared With Me
- Sent
- Wallet
- Task Node
- Chat
- RunPod
- Superthink

Not allowed in user-facing UI unless inside a maintainer/debug-only page:

- CryptPad
- cryptpad.fr
- Legacy CryptPad view
- CryptDrive
- CryptPad loading
- CryptPad account/login/signup phrasing
- upstream donation/help/about copy

### Cleanup Targets

| Surface | Current Risk | Target |
| --- | --- | --- |
| Loading/interstitial screens | Users see CryptPad or generic upstream load copy before PFT Docs appears | Replace with PFT Docs branded loading and error states |
| Login/register/recovery pages | Users can land on a CryptPad login flow that feels like a different app | Rebrand copy, hide irrelevant upstream account options, make wallet/PFT Docs flow primary |
| Drive navigation | "Drive" or CryptDrive language leaks implementation detail | Use Documents/Shared/Sent language consistently |
| Legacy document links | "Legacy CryptPad view" creates confusion | Remove from normal UI; keep only a maintainer/debug route if still needed |
| Help/about/footer/meta tags | Upstream docs and product identity leak | Replace with Post Fiat docs/help/contact copy |
| Browser titles/icons/manifests | Tabs and install surfaces may still say CryptPad | Rebrand to PFT Docs/Post Fiat |
| Error states | Upstream errors can blame CryptPad or instruct users to use CryptPad flows | Wrap common errors with PFT Docs-specific copy |
| Admin/debug pages | May still need upstream terms for maintainers | Mark maintainer-only and avoid linking from user navigation |

### Implementation Notes

- Start with an inventory using `rg -n "CryptPad|cryptpad|CryptDrive|Legacy CryptPad|cryptpad.fr"`.
- Prefer replacing display strings and templates over renaming upstream internal modules. Renaming internals such as `cryptpad-common.js` is not required and may make upstream merges harder.
- Add a small `docs/postfiat/BRANDING_SURFACE.md` that lists allowed user-facing terms, hidden upstream surfaces, and the files that own product copy.
- Add a lightweight product-copy check script after the first cleanup pass. It should scan bundled source for blocked user-facing strings while allowing explicit maintainer/internal paths.
- Do not delete upstream functionality blindly. First hide or wrap confusing surfaces, then remove dead routes once tests and manual flows prove they are unused.

### Success Condition

A normal user can open docs, unlock a wallet, share documents, use chat, view Task Node history, configure AI providers, and manage RunPod without seeing the word CryptPad or being sent into a CryptPad-branded login/interstitial/help flow.

## Documentation Plan

Existing docs are directionally useful but not enough for maintainable tooling. Add or update:

| Doc | Purpose |
| --- | --- |
| `docs/postfiat/APP_SURFACES.md` | User-facing surfaces, route names, entry points, and owning modules |
| `docs/postfiat/BRANDING_SURFACE.md` | Allowed product terms, blocked CryptPad-facing terms, and copy-owning files |
| `docs/postfiat/DATA_CONTRACTS.md` | Wallet session, Task Node history snapshot, chat session, chat memory, RunPod pod readiness, Nostr directory, peer message payload |
| `docs/postfiat/SECURITY_MODEL.md` | Where secrets live, what is E2E, what is browser-local, provider key caveats, relay metadata leakage |
| `docs/postfiat/AI_PROVIDERS.md` | Ambient/OpenRouter/RunPod request shape, streaming behavior, model defaults, failure modes |
| `docs/postfiat/TASKNODE_HISTORY.md` | On-chain/indexed/IPFS history loading, cache layers, display formatting, chat context packing |
| `docs/postfiat/ADR-0001-module-boundaries.md` | Why browser view modules stay AMD and pure logic lives in `src/postfiat` |

Each doc should include:

- owner module paths,
- storage keys,
- network endpoints,
- data examples,
- expected failure states,
- tests that cover the contract.

## Test Plan

Before extraction, add fixture tests around the most fragile pure logic:

| Test | Covers |
| --- | --- |
| `scripts/tests/postfiat-tasknode-format.test.mjs` | task payload extraction, task/reward grouping, collapsed verification text |
| `scripts/tests/postfiat-chat-context-pack.test.mjs` | recent vs historical task context packing, relevant older task retrieval |
| `scripts/tests/postfiat-superthink-prompt.test.mjs` | persona selector contract, voice contract generation, final quote extraction |
| `scripts/tests/postfiat-runpod-readiness.test.mjs` | model list parsing, ready/booting/stopped state transitions |
| `scripts/tests/postfiat-ai-provider-request.test.mjs` | Ambient/OpenRouter/RunPod request payloads and error messages |
| `scripts/tests/postfiat-http-runpod-proxy.test.js` | server-side RunPod proxy URL validation and native Ollama translation |

Keep existing gates:

```bash
node --check www/app/inner.js
npm run build:postfiat
npm run build:postfiat-share
npm run postfiat:compress-static
npm run test:postfiat
```

## Execution Sequence

Use `docs/postfiat/REFACTOR_BURNDOWN.md` as the checkable execution list for these phases.

### Phase 0: Stabilize The Baseline

- Keep `main` clean before every refactor PR.
- Add this plan and line-count inventory.
- Add a short `docs/postfiat/APP_SURFACES.md`.
- Add `docs/postfiat/BRANDING_SURFACE.md` with allowed Post Fiat/PFT Docs copy and blocked CryptPad-facing terms.
- Add a no-op module boundary ADR.
- Inventory user-visible CryptPad strings and classify each one as replace, hide, maintainer-only, or leave as internal code.

Exit criteria:

- Current behavior unchanged.
- Docs explain the current application shape well enough for another engineer to navigate.
- There is a concrete CryptPad product-surface removal checklist.

### Phase 0.5: Remove CryptPad From Normal User Flows

Why early: product identity confusion is not a deep architecture problem, but it makes the app feel unfinished and sends users into irrelevant upstream flows.

Work:

- Replace loading/interstitial copy with PFT Docs branded copy.
- Rebrand login/register/recovery pages that can be reached by normal users.
- Remove or hide "Legacy CryptPad view" from normal navigation.
- Rename user-facing Drive/CryptDrive language to Documents/Shared/Sent where appropriate.
- Replace upstream help/about/footer/title/meta strings with Post Fiat/PFT Docs strings.
- Add a copy-scan script or test allowlist for blocked user-facing CryptPad terms.

Exit criteria:

- A normal docs/chat/Task Node/RunPod flow contains no user-visible CryptPad branding.
- Any remaining CryptPad string is either internal source naming, maintainer-only UI, or explicitly allowlisted with a reason.

### Phase 1: Extract Pure Task Node Formatting

Why first: it is high-value, already needed by UI, chat, and Superthink, and can be tested without DOM.

Work:

- Create `src/postfiat/tasknode/format.mjs`.
- Move pure helpers from `inner.js`: preview, readable text extraction, task info, reward info, event sorting, middle preview.
- Add fixtures from current decrypted/indexed task history shapes.
- Re-export through a browser bundle or thin AMD bridge.
- Swap `inner.js` Task Node UI/chat pack code to use the extracted helpers.

Exit criteria:

- `renderTaskNodeWorkCard` uses imported formatting helpers.
- `buildTaskGroupChatBlock` uses imported formatting helpers.
- `inner.js` shrinks by at least 400 lines.

### Phase 2: Extract Chat Context And Memory

Why second: chat latency and context correctness are central product quality.

Work:

- Move chat memory summary, task context pack, relevant historical task retrieval, selected document section building into `src/postfiat/chat/context-pack.mjs`.
- Document cache keys and invalidation rules in `DATA_CONTRACTS.md`.
- Add tests for old-task summarization and relevance retrieval.

Exit criteria:

- Chat context behavior is covered by fixtures.
- App UI only orchestrates loading and rendering, not compression logic.

### Phase 3: Extract AI Provider Adapters

Work:

- Move Ambient/OpenRouter/RunPod request builders into `src/postfiat/ai/providers.mjs`.
- Move ODV extraction to `src/postfiat/ai/odv.mjs`.
- Move Superthink prompt builders to `src/postfiat/ai/superthink.mjs`.
- Keep browser fetch orchestration in the app layer.

Exit criteria:

- Provider payloads are testable without DOM.
- Superthink persona voice contracts and final quote extraction are fixture-tested.

### Phase 4: Split RunPod Client/View

Work:

- Create `www/app/postfiat/runpod-client.js` for key, pod, readiness, create/stop/delete state.
- Create `www/app/postfiat/runpod-view.js` for rendering.
- Document pod lifecycle: created, server up, model ready, selected for AI, stopped, terminated.

Exit criteria:

- Superthink and Chat share one readiness resolver.
- Stale endpoint 404 handling is documented and covered by tests.

### Phase 5: Split PFT Docs Views

Work:

- Extract route renderers from `inner.js` one at a time:
  - Task Node,
  - Chat,
  - Superthink,
  - Messages,
  - RunPod,
  - AI settings,
  - Docs/Shared/Sent.
- Keep `inner.js` as the composition shell.

Exit criteria:

- Each route has one renderer module and one state/service module where needed.
- `inner.js` under 2,500 lines.

### Phase 6: Split Styles

Work:

- Convert `app-postfiat.less` into import manifest.
- Move CSS by route/component.
- Keep responsive rules near the component when possible; use `responsive.less` only for cross-route shell behavior.

Exit criteria:

- No style file over 500 lines.
- Task Node, Chat, Superthink, and RunPod styles are independently inspectable.

### Phase 7: Extract Server Post Fiat API

Work:

- Move PFTL/IPFS/account-tx cache into `lib/postfiat/pftl-proxy.js`.
- Move RunPod proxy/Ollama bridge into `lib/postfiat/runpod-proxy.js`.
- Add `lib/postfiat/routes.js` and mount it from `http-worker.js`.

Exit criteria:

- `http-worker.js` no longer contains Post Fiat business logic.
- Server proxy validation has targeted tests.

### Phase 8: Split Wallet Core

Work:

- Keep public `wallet-core.mjs` as compatibility barrel.
- Move wallet/session/vault/PFT payment/Task Node history into separate modules.
- Add fixtures for indexed pftasks snapshots and on-chain pointer history.

Exit criteria:

- Wallet derivation and session vault code is isolated from Task Node history code.
- Task Node history loading can be imported independently by future apps.

### Phase 9: Drive Hook Isolation

Work:

- Extract PFT Drive inbox/share behavior from `www/common/drive-ui.js` into a hook module.
- Keep the Drive UI patch minimal and documented.

Exit criteria:

- PFT-specific Drive logic can be reviewed without reading the entire CryptPad Drive.

## First Three Concrete PRs

1. **Docs and test harness**
   - Add `APP_SURFACES.md`, `BRANDING_SURFACE.md`, `DATA_CONTRACTS.md` skeleton, ADR.
   - Add placeholder fixture directories under `scripts/tests/fixtures/postfiat/`.

2. **Product surface de-CryptPad pass**
   - Replace visible loading/login/help/title/navigation copy.
   - Hide or remove normal-user links to legacy CryptPad surfaces.
   - Add blocked-copy scanner with explicit internal allowlist.

3. **Task Node format extraction**
   - Create `src/postfiat/tasknode/format.mjs`.
   - Add `postfiat-tasknode-format.test.mjs`.
   - Wire Task Node UI and chat context to the extracted helpers.

4. **Superthink prompt extraction**
   - Create `src/postfiat/ai/superthink.mjs`.
   - Add tests for selector contract, voice contract defaults, quote extraction.
   - Keep temperature unchanged; enforce voice through prompt/data contract.

## Definition Of Done

This refactor is complete when:

- `www/app/inner.js` is under 1,500 lines.
- `www/app/app-postfiat.less` is an import manifest.
- Normal user flows do not show CryptPad branding, CryptDrive terminology, or legacy CryptPad entry points.
- Post Fiat server proxy code is out of `http-worker.js`.
- Wallet/session code is separated from Task Node history code.
- Every localStorage/sessionStorage key is documented in `DATA_CONTRACTS.md`.
- Every network endpoint used by PFT Docs is documented with request/response shape.
- `npm run test:postfiat`, `npm run build:postfiat`, `npm run build:postfiat-share`, and `npm run postfiat:compress-static` pass.
- A new engineer can answer "where does this behavior live?" from docs before reading code.
