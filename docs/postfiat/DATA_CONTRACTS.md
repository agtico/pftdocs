# PFT Docs Data Contracts

This document tracks browser storage keys, network endpoints, and module ownership for Post Fiat features.

## Browser Storage Keys

| Key | Storage | Owner | Data Shape | Notes |
| --- | --- | --- | --- | --- |
| `PFT_wallet_vault` | `localStorage` | `src/postfiat/wallet/vault.mjs` target | encrypted saved wallet vault | Password-protected local vault; not document E2E state |
| `PFT_wallet_session` | `sessionStorage` | `www/common/outer/local-store.js` | `"1"` marker | Indicates wallet-derived session login capability is active |
| `PFT_session_wallet` | `sessionStorage` | `src/postfiat/wallet/session-wallet.mjs` target | encrypted session wallet payload | Session-only unlocked wallet handoff |
| `PFT_last_wallet_address` | `localStorage` | wallet shell | address string | Used for last-wallet display only |
| `PFT_ai_provider_keys_v1` | `localStorage` | `src/postfiat/ai/providers.mjs` target | JSON object keyed by provider | Provider API keys are browser-local and not document E2E encrypted |
| `PFT_ai_provider_settings_v1` | `localStorage` | AI settings | JSON settings object | Provider/model/base URL settings |
| `PFT_runpod_api_key_v1` | `localStorage` | RunPod client | JSON object or key string | User-owned RunPod API key |
| `PFT_runpod_settings_v1` | `localStorage` | `www/app/postfiat/runpod-config.js` | JSON pod launch settings | GPU/model/container settings normalized before pod creation |
| `PFT_ai_chat_sessions_v1` | `localStorage` | chat state | `{ activeChatId, sessions }` | Browser-local chat transcripts |
| `PFT_ai_chat_options_v1` | `localStorage` | chat state | source/model/prompt options | Browser-local |
| `PFT_ai_chat_memory_v1:<sessionId>` | `localStorage` | chat context pack | durable chat summary | Background summary of older chat turns |
| `PFT_ai_chat_context_pack_v1:<wallet>` | `localStorage` | chat context pack | summarized older task history | Cache should be invalidated by wallet/history version |
| `PFT_tasknode_history_local_v3:<wallet>` | `localStorage` | tasknode history | task/context history snapshot | Per-wallet cache to reduce RPC/IPFS load |
| `PFT_tasknode_history_session_v3:<wallet>` | `sessionStorage` | tasknode history | short-lived history snapshot | Compatibility with older session keys |
| `PFT_tasknode_ipfs_json_v1:index` | `localStorage` | tasknode IPFS cache | CID index metadata | Used to avoid repeated IPFS gateway reads |
| `PFT_tasknode_ipfs_json_v1:<cid>` | `localStorage` | tasknode IPFS cache | IPFS JSON payload | Must contain encrypted/decrypted payload only when safe for local cache |
| `PFT_nostr_peer_messages_v1` | `localStorage` | peer messages | message cache | Browser-local peer message state |

## Network Endpoints

| Endpoint | Method | Owner | Purpose |
| --- | --- | --- | --- |
| `/api/postfiat/pftl/account-tx/:address` | GET | `lib/postfiat/pftl-proxy.js` target | Cached PFTL account transaction history |
| `/api/postfiat/pftl/rpc` | POST | `lib/postfiat/pftl-proxy.js` target | PFTL RPC proxy |
| `/api/postfiat/ipfs/:cid` | GET | `lib/postfiat/pftl-proxy.js` target | IPFS JSON fetch proxy |
| `/api/postfiat/runpod/gpu-types` | GET | `lib/postfiat/runpod-proxy.js` target | RunPod GPU type list |
| `/api/postfiat/runpod/pods` | GET/POST | `lib/postfiat/runpod-proxy.js` target | List/create pods |
| `/api/postfiat/runpod/pods/:podId` | GET/DELETE | `lib/postfiat/runpod-proxy.js` target | Get/terminate pod |
| `/api/postfiat/runpod/pods/:podId/stop` | POST | `lib/postfiat/runpod-proxy.js` target | Stop pod |
| `/api/postfiat/runpod/openai/models` | GET | `lib/postfiat/runpod-proxy.js` target | OpenAI-compatible RunPod model list |
| `/api/postfiat/runpod/openai/chat/completions` | POST | `lib/postfiat/runpod-proxy.js` target | OpenAI-compatible chat proxy / Ollama bridge |
| Ambient `/v1/responses` | POST | `www/app/postfiat/ai-providers.js` | Direct Ambient responses |
| OpenRouter `/api/v1/chat/completions` | POST | `www/app/postfiat/ai-providers.js` | ZDR-configured OpenRouter chat |
| RunPod proxy `*.proxy.runpod.net/v1` | GET/POST | `www/app/postfiat/ai-providers.js` / `runpod-config.js` | Direct user-selected Ollama/OpenAI-compatible pod endpoint |
| Nostr relays | websocket | peer/share workflow | Encrypted share and peer message delivery |

## AI Context Contract

Chat context is assembled in the browser from selected sources:

- latest decrypted Context Doc, when selected;
- readable Task Node history, when selected;
- selected documents by title/name;
- chat memory summary for older turns;
- recent turns from the active chat.

Provider API keys and outgoing AI requests are not document content and are not protected by document E2E encryption. When a source is selected, its plaintext is sent to the selected provider.

## Task Node History Contract

Task Node history should expose:

- `walletAddress`
- `loadedAt`
- `taskEvents`
- `contextUpdates`
- `readableTasks`
- `cacheSource`
- `lastLedger` or equivalent cursor when available
- `errors`

The UI should be able to render from cache first, then refresh from indexed/on-chain/IPFS sources without blocking basic navigation.

## RunPod Readiness Contract

RunPod readiness states:

- `missing_key`: no RunPod key available
- `stopped`: pod exists but is not running
- `checking`: readiness probe in progress
- `booting`: pod is running but model server/model is not ready
- `ready`: model list includes the selected model
- `stale_endpoint`: saved endpoint returns 404 or cannot be resolved
- `error`: non-retryable failure

Chat and Superthink must use the same readiness resolver.
