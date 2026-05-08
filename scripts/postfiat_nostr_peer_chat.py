#!/usr/bin/env python3
"""Python command surface for Post Fiat Nostr peer-chat smoke tests.

The protocol implementation lives in the repository's JavaScript modules. This
wrapper keeps Python iteration ergonomic while reusing the exact wallet-derived
Nostr identity, NIP-44, NIP-59 gift wrap, and relay code used by PFT Docs.

Examples:
    python3 scripts/postfiat_nostr_peer_chat.py directory --wallet rPo8...
    python3 scripts/postfiat_nostr_peer_chat.py send --to-wallet rPo8... --text "hello" --generate-sender --write-sender-mnemonic ./sender.seed
    python3 scripts/postfiat_nostr_peer_chat.py inbox --recipient-mnemonic-file /path/to/recipient_seed.txt
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
NODE_CLI = REPO_ROOT / "scripts" / "postfiat-nostr-peer-chat.mjs"


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--origin")
    parser.add_argument("--timeout-ms", type=int, default=10000)
    parser.add_argument("--limit", type=int)


def _append_option(argv: List[str], key: str, value: object | None) -> None:
    if value is None or value is False:
        return
    argv.append(key)
    if value is not True:
        argv.append(str(value))


def _run_node(command: str, args: argparse.Namespace, extra: Iterable[str]) -> int:
    argv = ["node", str(NODE_CLI), command, *extra]
    _append_option(argv, "--origin", getattr(args, "origin", None))
    _append_option(argv, "--timeout-ms", getattr(args, "timeout_ms", None))
    _append_option(argv, "--limit", getattr(args, "limit", None))
    proc = subprocess.run(argv, cwd=REPO_ROOT, check=False)
    return int(proc.returncode)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Post Fiat Nostr peer-chat smoke-test tooling."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-wallet")
    _add_common(create)
    create.add_argument("--write-mnemonic")

    identity = sub.add_parser("identity")
    _add_common(identity)
    identity.add_argument("--mnemonic-file", required=True)

    directory = sub.add_parser("directory")
    _add_common(directory)
    directory.add_argument("--wallet", required=True)

    publish_directory = sub.add_parser("publish-directory")
    _add_common(publish_directory)
    publish_directory.add_argument("--mnemonic-file", required=True)

    send = sub.add_parser("send")
    _add_common(send)
    send.add_argument("--to-wallet", required=True)
    send.add_argument("--text", required=True)
    send.add_argument("--sender-mnemonic-file")
    send.add_argument("--generate-sender", action="store_true")
    send.add_argument("--write-sender-mnemonic")
    send.add_argument("--publish-sender-directory", action="store_true")

    inbox = sub.add_parser("inbox")
    _add_common(inbox)
    inbox.add_argument("--recipient-mnemonic-file", required=True)
    inbox.add_argument("--since")
    inbox.add_argument("--until")

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    command = args.command
    if command == "create-wallet":
        extra: List[str] = []
        _append_option(extra, "--write-mnemonic", args.write_mnemonic)
        return _run_node(command, args, extra)
    if command == "identity":
        return _run_node(command, args, ["--mnemonic-file", args.mnemonic_file])
    if command == "directory":
        return _run_node(command, args, ["--wallet", args.wallet])
    if command == "publish-directory":
        return _run_node(command, args, ["--mnemonic-file", args.mnemonic_file])
    if command == "send":
        extra: List[str] = ["--to-wallet", args.to_wallet, "--text", args.text]
        _append_option(extra, "--sender-mnemonic-file", args.sender_mnemonic_file)
        _append_option(extra, "--generate-sender", args.generate_sender)
        _append_option(extra, "--write-sender-mnemonic", args.write_sender_mnemonic)
        _append_option(extra, "--publish-sender-directory", args.publish_sender_directory)
        return _run_node(command, args, extra)
    if command == "inbox":
        extra = ["--recipient-mnemonic-file", args.recipient_mnemonic_file]
        _append_option(extra, "--since", args.since)
        _append_option(extra, "--until", args.until)
        return _run_node(command, args, extra)
    raise AssertionError(f"unhandled command {command}")


if __name__ == "__main__":
    raise SystemExit(main())
