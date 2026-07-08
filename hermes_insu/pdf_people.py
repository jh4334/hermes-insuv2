from __future__ import annotations

import re
from typing import Final

from hermes_insu.pdf_text import normalize_line

PERSON_STOPWORDS: Final[frozenset[str]] = frozenset({
    "기안",
    "기안자",
    "담당",
    "담당자",
    "작성",
    "작성자",
    "검토",
    "검토자",
    "협조",
    "협조자",
    "결재",
    "결재자",
    "전결",
    "대결",
    "확인",
    "교장",
    "교감",
    "부장",
    "교사",
    "행정",
    "실장",
    "주무관",
    "장학사",
    "원감",
    "원장",
    "승인",
    "서명",
    "등록",
    "접수",
    "공개",
    "비공개",
    "내부",
    "보존",
    "제목",
    "본문",
    "수신",
    "발신",
    "참조",
    "경유",
    "관련",
    "시행",
    "시행일",
    "기안일",
    "등록일",
    "발송",
    "붙임",
    "별첨",
    "첨부",
    "통보",
    "회신",
    "공람",
    "직위",
    "성명",
    "직급",
    "처리과",
    "부서",
    "부서명",
    "안내",
    "실시",
    "점검",
    "보고",
    "운영",
    "계획",
    "현황",
    "조사",
    "평가",
    "지원",
    "연수",
    "교육",
    "관리",
    "지도",
    "의뢰",
    "배부",
    "제출",
    "회의",
    "연락",
    "요청",
    "변경",
    "정정",
    "감사",
    "예산",
    "정산",
    "결과",
    "일정",
    "대상",
    "신청",
    "선정",
    "알림",
    "안전",
    "홍보",
})

APPROVAL_ROLE_WORDS: Final[tuple[str, ...]] = (
    "교장",
    "교감",
    "원장",
    "원감",
    "수석교사",
    "영양교사",
    "보건교사",
    "사서교사",
    "전문상담교사",
    "교사",
    "행정실장",
    "실장",
    "행정주사",
    "주사",
    "주무관",
    "행정실무사",
    "실무사",
    "교육연구사",
    "연구사",
    "장학사",
    "지도사",
    "부장",
    "과장",
    "팀장",
    "계장",
)
APPROVAL_DATE_WORDS: Final[tuple[str, ...]] = APPROVAL_ROLE_WORDS + ("결재", "전결", "대결")

ROLE_SUFFIXES: Final[tuple[str, ...]] = (
    "교사",
    "교감",
    "교장",
    "부장",
    "실장",
    "주무관",
    "장학사",
    "원감",
    "원장",
    "주사",
    "연구사",
    "지도사",
    "실무사",
    "행정사",
    "과장",
    "팀장",
    "계장",
)


def approval_role_pattern() -> str:
    ordered_roles = sorted(APPROVAL_ROLE_WORDS, key=lambda value: len(value), reverse=True)
    return "|".join(ordered_roles)


def approval_date_pattern() -> str:
    ordered_words = sorted(APPROVAL_DATE_WORDS, key=lambda value: len(value), reverse=True)
    return "|".join(ordered_words)


def is_person_candidate(value: str) -> bool:
    candidate = normalize_line(value)
    if not re.fullmatch(r"[가-힣A-Za-z]{2,10}", candidate):
        return False
    if candidate in PERSON_STOPWORDS:
        return False
    if any(candidate.endswith(suffix) for suffix in ROLE_SUFFIXES):
        return False
    return True


def first_person_candidate(text: str) -> str:
    role_pattern = approval_role_pattern()
    for match in re.finditer(rf"(?:{role_pattern})\s*([가-힣A-Za-z]{{2,10}})", text):
        name = match.group(1)
        if is_person_candidate(name):
            return name
    for match in re.finditer(r"[가-힣A-Za-z]{2,10}", text):
        name = match.group(0)
        if is_person_candidate(name):
            return name
    return ""


def extract_owner_candidates_from_pdf_text(text: str, lines: list[str]) -> list[str]:
    candidates: list[str] = []

    # K-에듀파인 공문 PDF의 실제 기안자는 보통 말미 결재 블록의 ★ 표시가 붙은 칸에 있다.
    # 본문에는 "OO연구학교장", "담당 장학사"처럼 직위/기관명이 먼저 등장할 수 있으므로,
    # 전체 본문에서 role word를 무차별 탐색하지 않고 ★ 결재 블록을 최우선으로 좁혀 본다.
    normalized_lines = [normalize_line(line) for line in lines if normalize_line(line)]
    for index, line in enumerate(normalized_lines):
        if "★" in line:
            window = " ".join(normalized_lines[index : min(len(normalized_lines), index + 3)])
            candidates.extend(_three_syllable_people_from_approval_window(window))
            continue
        next_line = normalized_lines[index + 1] if index + 1 < len(normalized_lines) else ""
        next_next_line = normalized_lines[index + 2] if index + 2 < len(normalized_lines) else ""
        if line.startswith(("결재", "전결", "대결")):
            window = " ".join(part for part in (line, next_line, next_next_line) if part)
            candidates.extend(_three_syllable_people_from_approval_window(window))
        if _looks_like_approval_date_line(line) and any(role in next_line for role in APPROVAL_ROLE_WORDS):
            window = " ".join(part for part in (next_line, next_next_line) if part)
            candidates.extend(_three_syllable_people_from_approval_window(window))

    # 명시 필드가 있으면 보조 후보로만 둔다. 단, 본문 "담당 장학사" 같은 표현은 제외하기 위해
    # 3글자 한국어 이름만 받는다.
    for pattern in [
        r"(?:기안자|담당자|작성자)\s*[:：]?\s*([가-힣]{3})",
        r"담당\s*[:：]\s*([가-힣]{3})",
    ]:
        for match in re.finditer(pattern, text):
            if is_person_candidate(match.group(1)):
                candidates.append(match.group(1))

    # ★가 없는 오래된/변형 문서는 결재로 시작하는 좁은 줄에서만 fallback한다.
    if not candidates:
        role_pattern = approval_role_pattern()
        for line in normalized_lines:
            if not line.startswith(("결재", "전결", "대결")):
                continue
            for match in re.finditer(rf"(?:{role_pattern})\s*([가-힣]{{3}})", line):
                if is_person_candidate(match.group(1)):
                    candidates.append(match.group(1))

    return list(dict.fromkeys(candidates))


def _three_syllable_people_from_approval_window(window: str) -> list[str]:
    normalized = normalize_line(window)
    if not normalized:
        return []
    # 날짜/금액/문장부호를 제거해 결재 칸의 인명 흐름만 남긴다.
    normalized = re.sub(r"20\d{2}\s*(?:[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?\s*일?\.?", " ", normalized)
    normalized = re.sub(r"\d{1,2}\s*\.", " ", normalized)
    candidates: list[str] = []
    role_pattern = approval_role_pattern()
    for pattern in [
        rf"부장\s*([가-힣]{{3}})\s*(?=(?:{role_pattern}))",
        rf"(?<![가-힣])([가-힣]{{3}})\s*(?:{role_pattern})",
    ]:
        for match in re.finditer(pattern, normalized):
            name = match.group(1)
            if is_person_candidate(name) and not _looks_like_organization_fragment(name):
                candidates.append(name)
    for match in re.finditer(r"(?<![가-힣])([가-힣]{3})(?![가-힣])", normalized):
        name = match.group(1)
        if is_person_candidate(name) and not _looks_like_organization_fragment(name):
            candidates.append(name)
    return candidates


def _looks_like_approval_date_line(value: str) -> bool:
    normalized = normalize_line(value)
    return bool(
        re.fullmatch(
            r"20\d{2}\s*(?:[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}\s*\.?|년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)",
            normalized,
        )
    )


def _looks_like_organization_fragment(value: str) -> bool:
    return value.endswith(("학교", "기관", "교육", "기획", "행정", "연구", "업무", "지원", "부", "팀", "과")) or value in PERSON_STOPWORDS
