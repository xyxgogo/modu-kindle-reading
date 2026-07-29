#!/usr/bin/env python3
"""Decode a ChatGPT shared-conversation HTML archive.

The share page stores its loader data as a flattened JSON reference table inside
`window.__reactRouterContext.streamController.enqueue(...)`. This script keeps
the original HTML untouched and creates a readable JSON export plus a Markdown
transcript of every node on the selected conversation branch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_RE = re.compile(r"<script([^>]*)>(.*?)</script>", re.DOTALL)
ENQUEUE_RE = re.compile(r"enqueue\((.*)\);\s*$", re.DOTALL)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_reference_table(html: str) -> list[Any]:
    candidates: list[list[Any]] = []
    for match in SCRIPT_RE.finditer(html):
        body = match.group(2)
        enqueue = ENQUEUE_RE.search(body)
        if not enqueue:
            continue
        try:
            wire_text = json.loads(enqueue.group(1))
            value = json.loads(wire_text)
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(value, list):
            candidates.append(value)
    if not candidates:
        raise ValueError("No flattened conversation payload was found")
    return max(candidates, key=len)


def decode_reference_table(table: list[Any]) -> Any:
    memo: dict[int, Any] = {}

    def key_name(key: Any) -> Any:
        if isinstance(key, str) and key.startswith("_") and key[1:].isdigit():
            return table[int(key[1:])]
        return key

    def dereference(value: Any) -> Any:
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            # Negative values are transport sentinels (undefined, holes, etc.).
            return None if value < 0 else decode(value)
        if isinstance(value, list):
            return [dereference(item) for item in value]
        if isinstance(value, dict):
            return {key_name(key): dereference(item) for key, item in value.items()}
        return value

    def decode(index: int) -> Any:
        if index in memo:
            return memo[index]
        value = table[index]
        if isinstance(value, dict):
            result: dict[Any, Any] = {}
            memo[index] = result
            for key, item in value.items():
                result[key_name(key)] = dereference(item)
            return result
        if isinstance(value, list):
            result_list: list[Any] = []
            memo[index] = result_list
            result_list.extend(dereference(item) for item in value)
            return result_list
        memo[index] = value
        return value

    return decode(0)


def find_conversation(root: dict[str, Any]) -> dict[str, Any]:
    route = root["loaderData"]["routes/share.$shareId.($action)"]
    conversation = route["serverResponse"]["data"]
    if not isinstance(conversation, dict) or "mapping" not in conversation:
        raise ValueError("Decoded payload does not contain a conversation mapping")
    return conversation


def iso_time(value: Any) -> str:
    if not isinstance(value, (int, float)):
        return ""
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def selected_branch(conversation: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    mapping = conversation["mapping"]
    current = conversation.get("current_node")
    branch: list[tuple[str, dict[str, Any]]] = []
    seen: set[str] = set()
    while current and current in mapping and current not in seen:
        seen.add(current)
        node = mapping[current]
        branch.append((current, node))
        current = node.get("parent")
    branch.reverse()
    return branch


def render_content(content: dict[str, Any]) -> str:
    content_type = content.get("content_type", "unknown")
    if isinstance(content.get("text"), str):
        text = content["text"]
        if content_type == "code":
            language = content.get("language") or "text"
            return f"```{language}\n{text}\n```"
        return text

    parts = content.get("parts")
    if isinstance(parts, list):
        rendered = []
        for part in parts:
            rendered.append(part if isinstance(part, str) else json.dumps(part, ensure_ascii=False, indent=2))
        return "\n\n".join(rendered)

    remaining = {key: value for key, value in content.items() if key != "content_type"}
    if not remaining:
        return "_(empty content)_"
    return "```json\n" + json.dumps(remaining, ensure_ascii=False, indent=2) + "\n```"


def write_markdown(conversation: dict[str, Any], output: Path, source_url: str) -> None:
    branch = selected_branch(conversation)
    lines = [
        f"# {conversation.get('title', 'ChatGPT conversation')}",
        "",
        f"- Source: {source_url}",
        f"- Conversation ID: `{conversation.get('conversation_id', '')}`",
        f"- Created (UTC): {iso_time(conversation.get('create_time'))}",
        f"- Updated (UTC): {iso_time(conversation.get('update_time'))}",
        f"- Selected branch nodes: {len(branch)}",
        "",
        "> Tool outputs redacted by the original share page remain marked as redacted.",
        "",
    ]

    for index, (node_id, node) in enumerate(branch, 1):
        message = node.get("message")
        if not isinstance(message, dict):
            continue
        author = message.get("author") or {}
        role = author.get("role") or "unknown"
        name = author.get("name")
        label = f"{role} ({name})" if name else role
        content = message.get("content") or {}
        metadata = message.get("metadata") or {}
        lines.extend(
            [
                f"## {index:03d} · {label}",
                "",
                f"- Message ID: `{message.get('id', node_id)}`",
                f"- Time (UTC): {iso_time(message.get('create_time'))}",
                f"- Content type: `{content.get('content_type', 'unknown')}`",
            ]
        )
        if message.get("recipient"):
            lines.append(f"- Recipient: `{message['recipient']}`")
        if metadata.get("is_visually_hidden_from_conversation"):
            lines.append("- Originally hidden from the visible conversation: yes")
        lines.extend(["", render_content(content).rstrip(), ""])

    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html", type=Path, help="Downloaded ChatGPT share HTML")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--source-url", default="")
    args = parser.parse_args()

    html_path = args.html.resolve()
    output_dir = (args.output_dir or html_path.parent).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    html = html_path.read_text(encoding="utf-8")
    table = load_reference_table(html)
    root = decode_reference_table(table)
    conversation = find_conversation(root)
    source_url = args.source_url or conversation.get("continue_conversation_url", "").removesuffix("/continue")

    json_path = output_dir / "conversation.json"
    markdown_path = output_dir / "conversation.md"
    manifest_path = output_dir / "manifest.json"
    json_path.write_text(json.dumps(conversation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown(conversation, markdown_path, source_url)

    roles: Counter[str] = Counter()
    content_types: Counter[str] = Counter()
    for node in conversation["mapping"].values():
        message = node.get("message") if isinstance(node, dict) else None
        if not isinstance(message, dict):
            continue
        roles[(message.get("author") or {}).get("role") or "unknown"] += 1
        content_types[(message.get("content") or {}).get("content_type") or "unknown"] += 1

    manifest = {
        "source_url": source_url,
        "conversation_id": conversation.get("conversation_id"),
        "title": conversation.get("title"),
        "captured_html": html_path.name,
        "reference_table_items": len(table),
        "mapping_nodes": len(conversation["mapping"]),
        "selected_branch_nodes": len(selected_branch(conversation)),
        "roles": dict(roles),
        "content_types": dict(content_types),
        "files": {
            html_path.name: {"sha256": sha256(html_path), "bytes": html_path.stat().st_size},
            json_path.name: {"sha256": sha256(json_path), "bytes": json_path.stat().st_size},
            markdown_path.name: {"sha256": sha256(markdown_path), "bytes": markdown_path.stat().st_size},
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(conversation['mapping'])} nodes to {output_dir}")


if __name__ == "__main__":
    main()
