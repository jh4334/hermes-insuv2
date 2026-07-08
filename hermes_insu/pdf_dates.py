from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Final, Iterable, Literal

DatePrecision = Literal["day", "month"]

_DASH_CHARS: Final = "‐‑‒–—―−－"
_DASH_RE: Final = re.compile(f"[{_DASH_CHARS}]")
_DAY_DATE_RE: Final = re.compile(
    r"(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})"
    r"|(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일"
)
_MONTH_DATE_RE: Final = re.compile(
    r"(\d{4})\s*[.\-/]\s*(\d{1,2})\s*\.?(?!\s*\d)"
    r"|(\d{4})\s*년\s*(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)"
)


@dataclass(frozen=True)
class DateCandidate:
    value: str
    label: str
    precision: DatePrecision


@dataclass(frozen=True)
class _CandidateMatch:
    candidate: DateCandidate
    start: int


def normalize_dashes(text: str) -> str:
    return _DASH_RE.sub("-", text) if text else ""


def parse_korean_date_text(text: str) -> str:
    if not text:
        return ""
    match = _DAY_DATE_RE.search(normalize_dashes(text))
    if not match:
        return ""
    candidate = _candidate_from_day_match(match, "")
    return candidate.value if candidate else ""


def parse_context_date_text(text: str, label: str) -> DateCandidate | None:
    if not text:
        return None
    normalized = normalize_dashes(text)
    day_match = _DAY_DATE_RE.search(normalized)
    if day_match:
        return _candidate_from_day_match(day_match, label)
    month_match = _MONTH_DATE_RE.search(normalized)
    if not month_match:
        return None
    return _candidate_from_month_match(month_match, label)


def extract_date_candidates(text: str, label: str = "본문", allow_month: bool = False) -> list[DateCandidate]:
    normalized = normalize_dashes(text or "")
    matches: list[_CandidateMatch] = []
    day_spans: list[tuple[int, int]] = []
    for match in _DAY_DATE_RE.finditer(normalized):
        day_spans.append(match.span())
        candidate = _candidate_from_day_match(match, label)
        if candidate:
            matches.append(_CandidateMatch(candidate, match.start()))
    if allow_month:
        for match in _MONTH_DATE_RE.finditer(normalized):
            if any(_spans_overlap(match.span(), day_span) for day_span in day_spans):
                continue
            candidate = _candidate_from_month_match(match, label)
            if candidate:
                matches.append(_CandidateMatch(candidate, match.start()))
    return _dedupe_matches(matches)


def format_labeled_candidates(candidates: Iterable[DateCandidate]) -> str:
    parts: list[str] = []
    for candidate in candidates:
        label = candidate.label
        if candidate.precision == "month":
            label = f"{label}, 월 단위"
        parts.append(f"{candidate.value}({label})")
    return " / ".join(parts)


def _candidate_from_day_match(match: re.Match[str], label: str) -> DateCandidate | None:
    parts = [group for group in match.groups() if group is not None]
    if len(parts) != 3:
        return None
    return _candidate_from_values(parts[0], parts[1], parts[2], label, "day")


def _candidate_from_month_match(match: re.Match[str], label: str) -> DateCandidate | None:
    parts = [group for group in match.groups() if group is not None]
    if len(parts) != 2:
        return None
    return _candidate_from_values(parts[0], parts[1], "1", label, "month")


def _candidate_from_values(year: str, month: str, day: str, label: str, precision: DatePrecision) -> DateCandidate | None:
    try:
        value = date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return None
    return DateCandidate(value=value, label=label, precision=precision)


def _spans_overlap(left: tuple[int, int], right: tuple[int, int]) -> bool:
    return left[0] < right[1] and right[0] < left[1]


def _dedupe_matches(matches: Iterable[_CandidateMatch]) -> list[DateCandidate]:
    candidates: list[DateCandidate] = []
    seen: set[str] = set()
    for match in sorted(matches, key=lambda item: item.start):
        if match.candidate.value in seen:
            continue
        seen.add(match.candidate.value)
        candidates.append(match.candidate)
    return candidates
