# Nostr Peer Chat Smoke Tooling

This is local test tooling for Post Fiat wallet-address peer chat over Nostr.

The Python entrypoint is:

```bash
python3 scripts/postfiat_nostr_peer_chat.py --help
```

It wraps `scripts/postfiat-nostr-peer-chat.mjs`, which reuses the same PFT Docs implementation as the app:

- PFT wallet mnemonic -> wallet-derived Nostr identity
- wallet inbox directory events: kind `30078`
- peer chat payloads: Post Fiat JSON payload inside a NIP-59-style gift wrap
- encrypted message events: kind `1059`
- configured relays from `config.postFiat.nostr.privateRelays`

## Commands

Resolve a wallet address to its Nostr inbox directory:

```bash
python3 scripts/postfiat_nostr_peer_chat.py directory \
  --wallet rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx
```

Create a throwaway sender wallet and save the mnemonic locally:

```bash
python3 scripts/postfiat_nostr_peer_chat.py create-wallet \
  --write-mnemonic postfiat-nostr-test-sender.seed
```

Send a peer chat message:

```bash
python3 scripts/postfiat_nostr_peer_chat.py send \
  --to-wallet rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx \
  --sender-mnemonic-file postfiat-nostr-test-sender.seed \
  --publish-sender-directory \
  --text "hello over nostr"
```

Fetch and decrypt peer chat messages for a local recipient seed:

```bash
python3 scripts/postfiat_nostr_peer_chat.py inbox \
  --recipient-mnemonic-file /home/pfrpc/repos/runner.txt \
  --limit 20
```

The tools never print mnemonics. Mnemonic files should use the `.seed` suffix so they stay ignored by git.

## Live Smoke Test

On May 7, 2026, this tool:

- resolved `rPo8GkCA9YMKzuJGTHbj11kdVfPqSJHxNx` to the current inbox directory on `wss://relay.primal.net` and `wss://nos.lol`
- generated sender wallet `rNohhd1HeCXnPSJkPaJZMRfYqQr4J9SkRc`
- published the sender inbox directory to both relays
- published encrypted gift wrap `9d10b727a26b08e44dea6f08d9c716b82f453005b742e57b1cc363dc04e207f4` to both relays
- fetched and decrypted the message from the recipient inbox with zero decrypt failures
