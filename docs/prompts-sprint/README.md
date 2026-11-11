# Task Node Prompts: Phase 0 gate

The Node protocol works locally with the markdown app enabled, but the production
browser gate is blocked. This branch contains a spike and evidence, not the prompt
library/history/device implementation. Phases 1–3 must wait for this gate.

## Results (2026-11-11)

- PFDocs base: `206cacdc798df09ea7eaa0b6abd38e6aee4034c8` (remote main).
- Required libraries: chainpad 5.3.1, chainpad-netflux 1.3.1,
  chainpad-crypto 0.3.0, netflux-websocket 1.3.0.
- Local: reads persisted text using an edit capability, sees a browser edit in
  Node, reconnects and reads the latest text, edits in Node and observes that edit
  in the same browser tab. The local customization enables `code`; unmodified
  main disables it. No CSP bypass or browser response rewriting is used.
- Production: Node creates and reopens exactly one synthetic `/code/` test pad.
  The normal production browser displays “This application has been disabled.”
  The public app configuration lists only `drive`, `pad`, and `sheet`.
- Both browsers emit a WebAssembly CSP error. This did not prevent the successful
  local code collaboration after enabling the app; it is not the proven blocker.
- Two sampled production bridge files differ from main. See
  `spike/production-provenance.json` and `spike/production-diff.patch`. The delta
  includes assistant protocol handling, response budgets, document text extraction,
  and Task Node embed/readiness/chat behavior. These public assets do not establish
  the deployed server commit. Do not deploy this checkout over that unknown delta.

NEEDS-MANAGER: spike failed on the production browser because `/code/` is disabled.
Enable the markdown app through the manager-reviewed production configuration and
rerun Phase 0 before starting Phases 1–3. No deployment is performed by this sprint.

NEEDS-MANAGER: reconcile the production PFDocs source/build revision with repository
main before reviewing changes against production.

## Reproduce in a newly created checkout

All commands below run from the isolated PFDocs checkout. The local service uses
loopback ports 3190, 3191 and 3193. Check they are free first.

```sh
npm ci --cache .npm --ignore-scripts --no-audit --no-fund
npm run install:components
mkdir -p artifacts/spike-browser
printf '{"private":true}\n' > artifacts/spike-browser/package.json
npm install --prefix artifacts/spike-browser --cache .npm --ignore-scripts --no-audit --no-fund playwright@1.65.0
```

Use an installed Chromium through `CHROMIUM_PATH` or install the matching browser
under this checkout using Playwright's `PLAYWRIGHT_BROWSERS_PATH`. The recorded run
used Chromium from `/home/postfiat/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.

Create a **local-only** app customization. Stop if one already exists; do not
replace another environment's settings.

```sh
mkdir -p customize
node - <<'JS'
const fs = require('node:fs');
const input = fs.readFileSync('customize.dist/application_config.js', 'utf8');
fs.writeFileSync('customize/application_config.js', input.replace(
  '    return AppConfig;',
  "    AppConfig.availablePadTypes = [...AppConfig.availablePadTypes, 'code'];\n    return AppConfig;"
), { flag: 'wx' });
JS
CRYPTPAD_CONFIG="$PWD/docs/prompts-sprint/spike/local-config.cjs" DEV=1 node server.js
```

In another terminal, in the same checkout:

```sh
CHROMIUM_PATH=/path/to/chrome node scripts/prompts-headless-spike.cjs
```

The script logs only synthetic text, stage results and redacted diagnostics. It
uses an isolated browser context; it does not attach to existing browsers or tmux.
Browser temporary files stay under this checkout's ignored `artifacts/` directory.

The production command creates **one** synthetic pad on its first invocation and
reuses it on later runs. Its edit capability is kept in a mode-0600 ignored file
under `artifacts/`; do not print or commit that file, and retain it for the rerun.
No existing user pad is read or edited.

```sh
PFDOCS_ORIGIN=https://tasknode-pfdocs.fly.dev CHROMIUM_PATH=/path/to/chrome \
  node scripts/prompts-headless-spike.cjs
```

## Limits and next gate

This does not demonstrate Task Node prompt creation, local MCP tools, device key
approval, encrypted history, snapshots, stats, or the history database dump. The
four required history/stats/device/assistant regression smokes belong to the
blocked phases and have not been claimed as passing.

For a future CryptPad 2026.10 upgrade, revalidate v2 capability parsing, the signed
JSON code-document shape (`content`, `highlightMode`, `metadata`, `authormarks`),
SmartJSONTransformer, and the four library versions. No upgrade was attempted.

Raw results: [`local-final.jsonl`](spike/local-final.jsonl),
[`production-run.jsonl`](spike/production-run.jsonl) (first attempt, one new pad),
[`production-verified.jsonl`](spike/production-verified.jsonl) (same pad, explicit
`BROWSER_APP_DISABLED`). Screenshots: [local](spike/local-browser.png),
[production](spike/production-browser.png).
