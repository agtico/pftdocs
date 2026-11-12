# Task Node Prompts sprint

Manager ruling (2026-11-11 20:45 UTC): **Phase 0 passed**. This branch is based on `production-source-20260905` (`79f8a2a`), per the manager’s superseding 21:00 UTC note, and enables the markdown `code` app. No further production spike/pads or Fly deployment are authorized.

Phases 1–3 and the browser/local-MCP/Postgres acceptance are implemented in Task Node PR #386. This PFDocs branch adds prompt-specific code-pad routing, assistant suppression, input-activity events, and full editor snapshots over the existing exact-origin/channel/request bridge. Ordinary pad/sheet routes and sharing are unchanged.

## Local verification

Run `node --test scripts/tests/postfiat-prompts.test.js`. The local config at `spike/local-config.cjs` permits embedding by `http://localhost:3195`; the normal branch allowlist enables `code`, so the old local customization override is unnecessary.

Start from this checkout:

```sh
CRYPTPAD_CONFIG="$PWD/docs/prompts-sprint/spike/local-config.cjs" DEV=1 node server.js
```

Use Task Node's `docs/prompts-sprint/README.md` and `scripts/prompts-local-acceptance.mjs` for the full isolated acceptance, including actual device sign-in/approval, all local prompt tools, browser-visible edits, encrypted versions/stats, ciphertext-only database rows, and revocation. Review evidence is in `acceptance/` in both PRs.

## Recovered production source

The full production source supersedes the client-only baseline. It restores the ordinary-Docs stylesheet and bridge test expectations that were missing from the initial recovery. All 23 prompt, bridge, and chat protocol tests pass on this base. Run them with `node --test scripts/tests/postfiat-prompts.test.js scripts/tests/postfiat-tasknode-bridge.test.js scripts/tests/postfiat-tasknode-chat-protocol.test.js`. No production deployment or new production pad was used for this sprint continuation.

## Historical Phase 0 evidence

The local bidirectional Node/browser spike passed; the one production pad could be created and reopened by Node. Production's browser refused `code` because of the allowlist. That result is historical, not a reason to rerun production or block Phases 1–3.

Raw output and screenshots remain in `spike/`. The four protocol dependencies, v2 capability encoding, signed code-document JSON shape, and SmartJSONTransformer must be revalidated during the separate CryptPad upgrade. No upgrade is included here.

## Round 3 review

The updated Task Node acceptance demonstrates authenticated local device pairing, live edits, the editor version timeline, ciphertext-only history, offline recovery from the encrypted UI export, revocation, and usable Docs during a stalled history request. Five screenshots and raw stages are in `acceptance/`; the paired Task Node PR contains the implementations, migration 162, deletion/installer regression evidence, and review-browser instructions. Only the prompt bridge test was reformatted here; the PFDocs runtime behavior and recovered source base remain the same. The local PFDocs server is intentionally left running at `http://localhost:3190` with sandbox `3191` and websocket `3193`. No paid TIH command was run.
