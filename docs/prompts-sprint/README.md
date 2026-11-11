# Task Node Prompts sprint

Manager ruling (2026-11-11 20:45 UTC): **Phase 0 passed**. This branch is based on `production-client-baseline-20261111` (`f42d569`) and enables the markdown `code` app. No further production spike/pads or Fly deployment are authorized.

Phases 1–3 and the browser/local-MCP/Postgres acceptance are implemented in Task Node PR #386. This PFDocs branch adds prompt-specific code-pad routing, assistant suppression, input-activity events, and full editor snapshots over the existing exact-origin/channel/request bridge. Ordinary pad/sheet routes and sharing are unchanged.

## Local verification

Run `node --test scripts/tests/postfiat-prompts.test.js`. The local config at `spike/local-config.cjs` permits embedding by `http://localhost:3195`; the normal branch allowlist enables `code`, so the old local customization override is unnecessary.

Start from this checkout:

```sh
CRYPTPAD_CONFIG="$PWD/docs/prompts-sprint/spike/local-config.cjs" DEV=1 node server.js
```

Use Task Node's `docs/prompts-sprint/README.md` and `scripts/prompts-local-acceptance.mjs` for the full isolated acceptance, including actual device sign-in/approval, all local prompt tools, browser-visible edits, encrypted versions/stats, ciphertext-only database rows, and revocation. Review evidence is in `acceptance/` in both PRs.

## Recovered baseline limitation

The recovered baseline imports `/customize/src/less2/include/tasknode-chat.less`, absent from the checkout. Five older bridge tests fail on the baseline and this branch with identical names; see `acceptance/baseline-bridge-comparison.json`. The prompt-specific tests and local prompt acceptance pass. Manager provenance review must recover the ordinary-Docs stylesheet; this sprint does not replace ordinary Docs styling. Server `lib/` and built `src/` production provenance remain unverified, as stated by the manager.

## Historical Phase 0 evidence

The local bidirectional Node/browser spike passed; the one production pad could be created and reopened by Node. Production's browser refused `code` because of the allowlist. That result is historical, not a reason to rerun production or block Phases 1–3.

Raw output and screenshots remain in `spike/`. The four protocol dependencies, v2 capability encoding, signed code-document JSON shape, and SmartJSONTransformer must be revalidated during the separate CryptPad upgrade. No upgrade is included here.
