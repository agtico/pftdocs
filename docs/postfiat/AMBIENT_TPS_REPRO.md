# Ambient TPS Reproduction Notes

## Issue

PFT Docs chat was using Ambient through `POST /v1/chat/completions` with `stream: false`.
That path produced very poor user-visible latency in chat because the browser received nothing until the full response completed.

Direct Ambient testing showed the `/v1/responses` streaming endpoint is materially faster and gives usable first-token behavior.

## Observed Local Benchmark

Using the local Ambient key on May 7, 2026:

Legacy app-like path:

- Endpoint: `/v1/chat/completions`
- Mode: non-streaming
- Tiny `hello`: `6.775s` for a 1-word response
- Short prompt: `42.4s`, about `196` estimated output tokens
- Effective overall TPS: about `4.6`
- Medium prompt: timed out after `60s`

Streaming path:

- Endpoint: `/v1/responses`
- Mode: streaming
- Reasoning: disabled
- Tiny `hello`: first output at `3.38s`, total `3.42s`
- Short prompt: first output at `0.842s`
- Short prompt usage-reported output tokens: `168`
- Short prompt total time: `5.378s`
- Decode TPS: about `37.3`
- Overall TPS including first-token latency: about `31.2`

Conclusion: Ambient model throughput was not the main problem. The app was on the wrong request path for interactive chat.

## Current Repro Script Sample

Also on May 7, 2026, running:

```bash
python3 scripts/ambient-tps-repro.py --key-file /home/pfrpc/repos/ambient_xyz.txt --timeout-s 75
```

Produced:

- `/v1/chat/completions` non-streaming: `22.01s`, about `186` estimated output tokens, `8.45` overall TPS
- `/v1/responses` streaming: first output at `0.865s`, total `4.945s`, `166` usage-reported output tokens
- Streaming decode TPS: `41.16`
- Streaming overall TPS: `33.57`

This is the same model class and same Ambient account key. The app-visible latency difference is endpoint/request-path behavior, not evidence that Ambient is inherently decoding at 4 TPS.

## Fix Applied In PFT Docs

Chat now uses:

- `POST https://api.ambient.xyz/v1/responses`
- `stream: true`
- `store: false`
- `emit_usage: true`
- `reasoning.enabled: false` in Fast mode
- `reasoning.enabled: true` only when the user explicitly enables Thinking

The app feeds SSE deltas into the existing chat streaming renderer.

## Reproduction Script

Run from the repository root:

```bash
AMBIENT_API_KEY=... python3 scripts/ambient-tps-repro.py
```

Or:

```bash
python3 scripts/ambient-tps-repro.py --key-file /path/to/ambient_key.txt
```

Optional:

```bash
python3 scripts/ambient-tps-repro.py --runs 3 --timeout-s 90
```

The script does not print the API key. It compares:

- `/v1/chat/completions` non-streaming
- `/v1/responses` streaming

It reports total time, first-output latency for streaming, estimated or usage-reported output tokens, decode TPS, and overall TPS.
