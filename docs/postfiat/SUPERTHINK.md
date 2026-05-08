# Superthink

Superthink is a RunPod-only PFT Docs route for multi-pass historical-persona synthesis over a wallet's local context.

## Flow

1. Load the active wallet context:
   - latest decrypted context doc
   - Task Node context pack, with old tasks summarized and recent tasks preserved in more detail
   - lightweight chat memory for the active chat session, when present
2. Round 1 selects five historical personas relevant to the context.
3. Each selected persona is queried concurrently and returns:
   - a two-paragraph persona brief
   - a two-paragraph in-role feedback response
4. A manager call compresses the five responses into a short synthesis.
5. Rounds 2-3 repeat persona selection with:
   - the same wallet context
   - the prior round transcript, manager synthesis, and persona feedback gist
   - an explicit exclusion list of all personas already used
6. A final editor call turns the full transcript into a single report.

## RunPod Settings

The route calls only the configured RunPod endpoint. For Ollama Qwen pods it sends native Ollama requests through the PFT Docs proxy with:

- `think: false`
- `chat_template_kwargs.enable_thinking: false`
- bounded token caps per stage
- five concurrent persona calls per round
- three rounds by default
- fallback persona filling when Qwen returns malformed or repeated selector output

The current implementation intentionally combines persona description and persona feedback into one model call per persona. That keeps the visible UX aligned with the original design while reducing the three-round run from roughly 37 model calls to 22.

With the three-round default, the normal run is about 22 model calls: three selectors, fifteen persona consultations, three manager summaries, and one final editor pass.

## Smoke Result

Live proxy smoke on the existing `qwen3.6:27b` RunPod pod:

- five concurrent persona-sized calls
- wall time: about 12.3s
- aggregate completion throughput: about 51 tokens/sec
- native `/api/chat` path produced content correctly with thinking disabled

## Refactor Note

The current route is implemented in `www/app/inner.js` to land the feature quickly, but it should be extracted. The obvious split is:

- `www/common/postfiat-superthink.js` for orchestration and prompt builders
- `www/app/inner.js` for route rendering and event binding only
- a small test around persona JSON parsing and transcript assembly
