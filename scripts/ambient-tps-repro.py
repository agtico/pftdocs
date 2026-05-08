#!/usr/bin/env python3
"""Reproduce Ambient latency/TPS difference between chat and streaming APIs.

Usage:
    AMBIENT_API_KEY=... python3 scripts/ambient-tps-repro.py
    python3 scripts/ambient-tps-repro.py --key-file /path/to/ambient_key.txt

The script never prints the API key.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import httpx


DEFAULT_BASE_URL = "https://api.ambient.xyz"
DEFAULT_MODEL = "ambient/large"
DEFAULT_PROMPT = (
    "Write 5 concise bullet points about why low latency matters in private AI chat."
)


def read_api_key(path: Optional[str]) -> str:
    if path:
        return Path(path).read_text().strip()
    env_key = os.getenv("AMBIENT_API_KEY", "").strip()
    if env_key:
        return env_key
    for candidate in (
        Path.cwd() / "ambient_api_key.txt",
        Path.cwd() / "ambient_xyz.txt",
        Path.cwd().parent / "ambient_xyz.txt",
    ):
        if candidate.exists():
            value = candidate.read_text().strip()
            if value:
                return value
    raise SystemExit("Missing Ambient key. Set AMBIENT_API_KEY or pass --key-file.")


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4))


def output_tokens_from_usage(data: Dict[str, Any]) -> Optional[int]:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return None
    for key in ("output_tokens", "completion_tokens", "generated_tokens"):
        value = usage.get(key)
        if isinstance(value, int):
            return value
    return None


def iter_sse_data_lines(response: httpx.Response) -> Iterable[str]:
    for line in response.iter_lines():
        if not line or line.startswith("event:"):
            continue
        if line.startswith("data:"):
            yield line[5:].strip()


def extract_stream_delta(event: Dict[str, Any]) -> str:
    event_type = str(event.get("type", ""))
    delta = event.get("delta")
    if isinstance(delta, str) and ("output" in event_type or "text" in event_type):
        return delta
    if isinstance(delta, str) and not event_type:
        return delta
    return ""


def run_chat_completions(
    *,
    api_key: str,
    base_url: str,
    model: str,
    prompt: str,
    timeout_s: float,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "temperature": 0.2,
    }
    start = time.perf_counter()
    try:
        response = httpx.post(
            base_url.rstrip("/") + "/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=httpx.Timeout(timeout_s, connect=10.0),
        )
        elapsed = time.perf_counter() - start
    except Exception as exc:
        return {
            "endpoint": "/v1/chat/completions",
            "mode": "non_streaming",
            "ok": False,
            "seconds": round(time.perf_counter() - start, 3),
            "error": str(exc),
        }
    if response.status_code != 200:
        return {
            "endpoint": "/v1/chat/completions",
            "mode": "non_streaming",
            "ok": False,
            "status": response.status_code,
            "seconds": round(elapsed, 3),
            "error": response.text[:500],
        }
    data = response.json()
    text = ""
    try:
        text = data["choices"][0]["message"]["content"] or ""
    except Exception:
        text = ""
    usage_tokens = output_tokens_from_usage(data)
    tokens = usage_tokens or estimate_tokens(text)
    return {
        "endpoint": "/v1/chat/completions",
        "mode": "non_streaming",
        "ok": True,
        "seconds": round(elapsed, 3),
        "chars": len(text),
        "words": len(text.split()),
        "tokens": tokens,
        "tokens_source": "usage" if usage_tokens else "chars/4 estimate",
        "overall_tps": round(tokens / max(elapsed, 1e-6), 2),
        "preview": text[:140],
    }


def run_responses_stream(
    *,
    api_key: str,
    base_url: str,
    model: str,
    prompt: str,
    timeout_s: float,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload = {
        "model": model,
        "input": prompt,
        "stream": True,
        "store": False,
        "emit_usage": True,
        "reasoning": {"enabled": False},
    }
    start = time.perf_counter()
    first_event: Optional[float] = None
    first_output: Optional[float] = None
    last_output: Optional[float] = None
    output_parts: List[str] = []
    usage_tokens: Optional[int] = None
    events = 0
    output_delta_events = 0
    try:
        with httpx.stream(
            "POST",
            base_url.rstrip("/") + "/v1/responses",
            json=payload,
            headers=headers,
            timeout=httpx.Timeout(timeout_s, connect=10.0, read=timeout_s),
        ) as response:
            if response.status_code != 200:
                body = response.read().decode("utf-8", "replace")
                return {
                    "endpoint": "/v1/responses",
                    "mode": "streaming",
                    "ok": False,
                    "status": response.status_code,
                    "seconds": round(time.perf_counter() - start, 3),
                    "error": body[:500],
                }
            for data in iter_sse_data_lines(response):
                now = time.perf_counter()
                if first_event is None:
                    first_event = now
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue
                events += 1
                usage = output_tokens_from_usage(event)
                if usage is not None:
                    usage_tokens = usage
                delta = extract_stream_delta(event)
                if delta:
                    output_delta_events += 1
                    if first_output is None:
                        first_output = now
                    last_output = now
                    output_parts.append(delta)
    except Exception as exc:
        return {
            "endpoint": "/v1/responses",
            "mode": "streaming",
            "ok": False,
            "seconds": round(time.perf_counter() - start, 3),
            "error": str(exc),
        }
    elapsed = time.perf_counter() - start
    text = "".join(output_parts)
    tokens = usage_tokens or estimate_tokens(text)
    decode_window = max(
        (last_output or time.perf_counter()) - (first_output or time.perf_counter()),
        0.0,
    )
    decode_tps = (
        round(tokens / decode_window, 2)
        if output_delta_events > 1 and decode_window >= 0.05
        else None
    )
    return {
        "endpoint": "/v1/responses",
        "mode": "streaming",
        "ok": True,
        "events": events,
        "output_delta_events": output_delta_events,
        "seconds": round(elapsed, 3),
        "tt_first_event_s": None if first_event is None else round(first_event - start, 3),
        "tt_first_output_s": None if first_output is None else round(first_output - start, 3),
        "decode_seconds": round(decode_window, 3),
        "chars": len(text),
        "words": len(text.split()),
        "tokens": tokens,
        "tokens_source": "usage" if usage_tokens else "chars/4 estimate",
        "decode_tps": decode_tps,
        "overall_tps": round(tokens / max(elapsed, 1e-6), 2),
        "preview": text[:140],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--key-file")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--timeout-s", type=float, default=60.0)
    args = parser.parse_args()

    api_key = read_api_key(args.key_file)
    results: List[Dict[str, Any]] = []
    for i in range(max(1, args.runs)):
        print(f"run {i + 1}/{args.runs}: chat/completions non-streaming", flush=True)
        results.append(
            run_chat_completions(
                api_key=api_key,
                base_url=args.base_url,
                model=args.model,
                prompt=args.prompt,
                timeout_s=args.timeout_s,
            )
        )
        print(f"run {i + 1}/{args.runs}: responses streaming", flush=True)
        results.append(
            run_responses_stream(
                api_key=api_key,
                base_url=args.base_url,
                model=args.model,
                prompt=args.prompt,
                timeout_s=args.timeout_s,
            )
        )

    print("\nRAW RESULTS")
    print(json.dumps(results, indent=2))

    print("\nSUMMARY")
    for mode in ("non_streaming", "streaming"):
        ok = [r for r in results if r.get("ok") and r.get("mode") == mode]
        if not ok:
            print(f"{mode}: no successful runs")
            continue
        print(
            f"{mode}: avg overall_tps={statistics.mean(r['overall_tps'] for r in ok):.2f}, "
            f"avg seconds={statistics.mean(r['seconds'] for r in ok):.2f}"
        )
        if mode == "streaming":
            first_outputs = [
                r["tt_first_output_s"]
                for r in ok
                if r.get("tt_first_output_s") is not None
            ]
            if first_outputs:
                decode_values = [
                    r["decode_tps"] for r in ok if r.get("decode_tps") is not None
                ]
                avg_decode = (
                    f"{statistics.mean(decode_values):.2f}" if decode_values else "n/a"
                )
                print(
                    f"{mode}: avg tt_first_output_s={statistics.mean(first_outputs):.2f}, "
                    f"avg decode_tps={avg_decode}"
                )
            else:
                decode_values = [
                    r["decode_tps"] for r in ok if r.get("decode_tps") is not None
                ]
                avg_decode = (
                    f"{statistics.mean(decode_values):.2f}" if decode_values else "n/a"
                )
                print(
                    f"{mode}: avg tt_first_output_s=n/a, "
                    f"avg decode_tps={avg_decode}"
                )


if __name__ == "__main__":
    main()
