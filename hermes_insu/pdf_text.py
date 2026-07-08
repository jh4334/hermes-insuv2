from __future__ import annotations

import re
from typing import Iterable


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def unique_join(values: Iterable[str], limit: int = 5) -> str:
    result: list[str] = []
    for value in values:
        cleaned = normalize_line(str(value))
        if cleaned and cleaned not in result:
            result.append(cleaned)
        if len(result) >= limit:
            break
    return " / ".join(result)
