from __future__ import annotations

from typing import Any


def encode_token(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def decode_token(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def resolve_pointer(document: Any, pointer: str) -> Any:
    if pointer in ("", "/"):
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"JSON pointer must start with '/': {pointer}")
    current = document
    for raw in pointer.lstrip("/").split("/"):
        token = decode_token(raw)
        if isinstance(current, list):
            index = int(token)
            current = current[index]
        elif isinstance(current, dict):
            if token not in current:
                raise KeyError(pointer)
            current = current[token]
        else:
            raise KeyError(pointer)
    return current


def pointer_exists(document: Any, pointer: str) -> bool:
    try:
        resolve_pointer(document, pointer)
    except (KeyError, ValueError, TypeError, IndexError):
        return False
    return True


def extract_text_at(document: Any, pointer: str) -> str:
    value = resolve_pointer(document, pointer)
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    return ""


def walk_text_fields(data: Any, prefix: str = "/data") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    def visit(node: Any, path: str) -> None:
        if isinstance(node, str) and node.strip():
            found.append((path, node))
        elif isinstance(node, dict):
            for key, value in node.items():
                visit(value, f"{path}/{encode_token(str(key))}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                visit(value, f"{path}/{index}")

    visit(data, prefix)
    return found
