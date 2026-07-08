from __future__ import annotations

import io
import re
from pathlib import Path
from typing import BinaryIO, Iterable

from hermes_insu.pdf_dates import (
    DateCandidate,
    extract_date_candidates,
    format_labeled_candidates,
    normalize_dashes,
    parse_context_date_text,
)
from hermes_insu.pdf_people import approval_role_pattern, extract_owner_candidates_from_pdf_text
from hermes_insu.pdf_text import normalize_line, unique_join


SENDER_PREFIX_RE = re.compile(r"^(?:발신기관|발신|보낸기관|시행기관)\s*[:：]?\s*(?P<sender>[가-힣A-Za-z0-9_·.()\- ]{2,80})")
SENDER_ORG_SUFFIX_RE = re.compile(r"(?:교육청|교육지원청|학교|도청|시청|군청|구청|청|부|처|원|센터|협회|공단|재단|위원회)$")


def extract_sender_org_from_pdf_text(text: str, lines: list[str] | None = None) -> str:
    source_lines = lines if lines is not None else [normalize_line(line) for line in text.splitlines() if normalize_line(line)]
    for line in source_lines:
        match = SENDER_PREFIX_RE.search(line)
        if match:
            sender = re.split(r"\s{2,}|수신|제목|시행", match.group("sender"))[0].strip(" /·,-:：")
            if sender:
                return sender
    for index, line in enumerate(source_lines[:8]):
        if any(token in line for token in ("수신", "경유", "제목", "시행", "접수")):
            continue
        if len(line) <= 30 and SENDER_ORG_SUFFIX_RE.search(line):
            next_lines = " ".join(source_lines[index + 1:index + 3])
            if "수신" in next_lines or "제목" in next_lines:
                return line
    return ""


def extract_context_date_candidates(text: str) -> list[DateCandidate]:
    normalized = normalize_line(text or "")
    line_text = normalize_dashes(text or "")
    candidates: list[DateCandidate] = []
    patterns = [
        ("시행(괄호)", r"^시행\s+[가-힣A-Za-z0-9]+-\d+\s*\(([0-9년월일.\-/\s]{6,30})\)"),
        ("시행일", r"^시행일자?(?![가-힣])\s*[:：]?\s*([^\n]{0,40})"),
        ("기안일", r"^(?:기안일)\s*[:：]?\s*([^\n]{0,40})"),
        ("등록일", r"^(?:등록일)\s*[:：]?\s*([^\n]{0,40})"),
    ]
    for line in line_text.splitlines():
        normalized_line = normalize_line(line)
        for label, pattern in patterns:
            for match in re.finditer(pattern, normalized_line):
                parsed = parse_context_date_text(match.group(1), label)
                if parsed:
                    candidates.append(parsed)

    # 공문 등록/상신일은 본문 일정이 아니라 말미 결재라인 근처에 있다.
    # "수신 내부결재" 같은 머리말에 딸린 본문 날짜를 잘못 잡지 않도록 ★/직위/전결·대결 줄과
    # 그 바로 앞뒤 줄만 본다.
    approval_dates = extract_approval_line_date_candidates(line_text)
    for candidate in reversed(approval_dates):
        candidates.insert(0, candidate)

    deduped: list[DateCandidate] = []
    seen = set()
    for candidate in sorted(candidates, key=lambda item: item.precision == "month"):
        if candidate.value not in seen:
            seen.add(candidate.value)
            deduped.append(candidate)
    return deduped


def extract_approval_line_date_candidates(text: str) -> list[DateCandidate]:
    lines = [normalize_line(line) for line in text.splitlines() if normalize_line(line)]
    role_word = approval_role_pattern()
    candidates: list[DateCandidate] = []
    for index, line in enumerate(lines):
        previous_line = lines[index - 1] if index > 0 else ""
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        next_next_line = lines[index + 2] if index + 2 < len(lines) else ""
        line_is_approval = _is_approval_line(line, role_word)
        next_is_approval = _is_approval_line(next_line, role_word)
        if not line_is_approval and not next_is_approval:
            continue
        split_candidate = _reconstruct_split_approval_date(line, next_line, next_next_line, role_word)
        if split_candidate:
            candidates.append(split_candidate)
            continue
        line_dates = extract_approval_dates_from_line(line)
        if line_dates and line_is_approval:
            candidates.extend(line_dates)
            continue
        if line_dates and next_is_approval and _looks_like_standalone_date_line(line):
            candidates.extend(line_dates)
            continue
        if line_is_approval and _looks_like_standalone_date_line(previous_line):
            previous_split = _reconstruct_split_approval_date(previous_line, line, next_line, role_word)
            if previous_split:
                candidates.append(previous_split)
            else:
                candidates.extend(extract_date_candidates(previous_line, label="결재라인", allow_month=True))
    return _dedupe_date_candidates(candidates)


def _reconstruct_split_approval_date(line: str, next_line: str, next_next_line: str, role_word: str) -> DateCandidate | None:
    """Recover dates rendered as `대결 2025. 3.` / `★부서` / `이름 교감 24.`.

    Some exported school PDFs split the approval table so the year/month is on the
    approval status line and the day appears after an approver role on the next line.
    Returning a day-precision candidate prevents false `YYYY-MM-01` calendar dates.
    """
    month_match = re.search(r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*\.?\s*$", normalize_dashes(line))
    if not month_match:
        return None
    day_source = " ".join(part for part in (next_line, next_next_line) if part)
    # Prefer the day printed after an approval role; avoid schedule/body days before the approval block.
    day_match = re.search(rf"(?:{role_word})\s*[가-힣A-Za-z]{{0,10}}\s*(\d{{1,2}})\s*\.", day_source)
    if not day_match:
        day_match = re.search(rf"[가-힣]{{2,3}}\s*(?:{role_word})\s*(\d{{1,2}})\s*\.", day_source)
    if not day_match:
        return None
    try:
        from datetime import date

        value = date(int(month_match.group(1)), int(month_match.group(2)), int(day_match.group(1))).isoformat()
    except ValueError:
        return None
    return DateCandidate(value=value, label="결재라인", precision="day")


def extract_approval_dates_from_line(line: str) -> list[DateCandidate]:
    candidates = extract_date_candidates(line, label="결재라인", allow_month=True)
    if not candidates:
        return []
    after_submit = re.search(r"상신\s*([0-9년월일.\-/\s]{6,30})", line)
    if after_submit:
        submitted = extract_date_candidates(after_submit.group(1), label="결재라인", allow_month=True)
        if submitted:
            return submitted[-1:]
    if "관련" in line:
        if len(candidates) > 1:
            return candidates[-1:]
        return []
    return candidates


def _is_approval_line(line: str, role_word: str) -> bool:
    normalized = normalize_line(line)
    if not normalized:
        return False
    if "★" in normalized:
        return True
    if normalized.startswith(("결재", "전결", "대결")):
        return True
    if re.match(rf"^(?:{role_word})\s*[가-힣A-Za-z]{{2,10}}", normalized):
        return True
    if re.match(r"^[가-힣A-Za-z0-9]{2,16}부장\s*[가-힣A-Za-z]{2,10}", normalized):
        return True
    return False


def _looks_like_standalone_date_line(line: str) -> bool:
    normalized = normalize_line(line)
    if not normalized or "관련" in normalized or re.match(r"^\d{1,2}\.\s", normalized):
        return False
    return bool(re.fullmatch(r"\d{4}\s*(?:[.\-/]\s*\d{1,2}\s*(?:[.\-/]\s*\d{1,2}\s*\.?)?|년\s*\d{1,2}\s*월\s*(?:\d{1,2}\s*일)?)", normalized))


def _dedupe_date_candidates(candidates: Iterable[DateCandidate]) -> list[DateCandidate]:
    deduped: list[DateCandidate] = []
    seen = set()
    for candidate in candidates:
        key = (candidate.value, candidate.label, candidate.precision)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def extract_department_from_pdf_text(text: str, lines: list[str]) -> str:
    text = normalize_dashes(text)
    patterns = [
        r"(?:부서명|담당부서|처리과)(?![가-힣])\s*[:：]?\s*([^\n\r]{2,30})",
        r"부서\s*[:：]\s*([^\n\r]{2,30})",
        r"시행\s+([가-힣A-Za-z0-9]+)\s*-\s*\d+",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return normalize_line(match.group(1))[:30]
    for line in lines:
        match = re.search(r"([가-힣A-Za-z0-9]+)\s*-\s*\d{2,}", normalize_dashes(line))
        if match and "시행" in line:
            return match.group(1).strip()
    return ""


def extract_doc_number_from_pdf_text(text: str) -> str:
    text = normalize_dashes(text)
    patterns = [
        (r"시행\s+([가-힣A-Za-z][가-힣A-Za-z0-9]*)\s*-\s*(\d+)", True),
        (r"(?:문서번호|문서 번호|등록번호)\s*[:：]?\s*([가-힣A-Za-z0-9\-_]+)", False),
    ]
    for pattern, has_split_groups in patterns:
        match = re.search(pattern, text)
        if match:
            if has_split_groups:
                return f"{match.group(1)}-{match.group(2)}"
            return match.group(1).strip()
    return ""


def extract_title_candidates(lines: list[str], file_name: str) -> list[str]:
    candidates: list[str] = []
    for index, line in enumerate(lines):
        if "제목" in line:
            suffix = re.sub(r"^.*?제목\s*[:：]?\s*", "", line).strip()
            prefix = lines[index - 1].strip() if index > 0 else ""
            next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
            if not suffix and prefix and next_line and _looks_like_title_prefix(prefix):
                if len(next_line) <= 3 or not _is_noise_title_line(next_line):
                    candidates.append(normalize_line(f"{prefix}{next_line}"))
            if suffix:
                if len(suffix) <= 3 and prefix and _looks_like_title_prefix(prefix):
                    candidates.append(normalize_line(f"{prefix}{suffix}"))
                if prefix and len(prefix) > 8 and not any(noise in prefix for noise in ("수신", "경유")):
                    candidates.append(normalize_line(f"{prefix} {suffix}"))
                candidates.append(normalize_line(suffix))
            elif index + 1 < len(lines):
                candidates.append(normalize_line(lines[index + 1]))
    for line in lines:
        if _looks_like_title_prefix(line):
            candidates.append(normalize_line(line))
    fallback = Path(file_name).stem
    candidates.append(fallback)
    return list(dict.fromkeys([item for item in candidates if item]))[:5]


def _is_noise_title_line(line: str) -> bool:
    normalized = normalize_line(line)
    noise_words = (
        "수신",
        "경유",
        "시행",
        "접수",
        "전화",
        "팩스",
        "협조자",
        "실력다짐",
        "충북교육",
        "http",
        "불편공문서",
    )
    return not normalized or any(noise in normalized for noise in noise_words) or normalized.endswith("학교")


def _looks_like_title_prefix(line: str) -> bool:
    normalized = normalize_line(line)
    if len(normalized) < 6 or _is_noise_title_line(normalized):
        return False
    if re.fullmatch(r"[가-힣A-Za-z]{1,4}", normalized):
        return False
    if re.match(r"^\d{1,2}\.\s", normalized):
        return False
    return bool(re.search(r"20\d{2}", normalized)) or any(keyword in normalized for keyword in ("학년도", "운영", "계획", "결과", "보고", "구입", "제작", "제출", "협의회", "교육", "연구학교"))


def extraction_confidence_score(source_date: str, title: str, owner: str, department: str, title_from_name: bool, sender_org: str = "", document_type: str = "draft") -> tuple[int, str]:
    score = 15
    evidence: list[str] = []
    if source_date:
        score += 25
        evidence.append("날짜 추출")
    if title and not title_from_name:
        score += 25
        evidence.append("제목 추출")
    if document_type == "received":
        if sender_org:
            score += 25
            evidence.append("발신기관 추출")
    elif owner:
        score += 25
        evidence.append("담당자 추출")
    if department:
        score += 10
        evidence.append("부서 추출")
    return min(score, 100), ", ".join(evidence) if evidence else "자동 추출 근거 부족"


def extraction_status_details(source_date: str, title: str, owner: str, confidence: int, file_name: str, sender_org: str = "", document_type: str = "draft") -> str:
    reasons = []
    if not source_date:
        reasons.append("날짜 확인")
    if document_type == "received":
        if not sender_org:
            reasons.append("발신기관 확인")
    elif not owner:
        reasons.append("담당자 확인")
    if not title or title == Path(file_name).stem:
        reasons.append("제목 확인")
    if confidence < 80 and not reasons:
        reasons.append("신뢰도 확인")
    if not reasons:
        return "추출 완료"
    return " / ".join(reasons)


def extract_pdf_text_from_bytes(data: bytes) -> tuple[str, str]:
    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            parts = []
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    parts.append(page_text)
                try:
                    for table in page.extract_tables() or []:
                        for row in table or []:
                            line = " ".join(normalize_line(cell or "") for cell in row if normalize_line(cell or ""))
                            if line:
                                parts.append(line)
                except Exception:
                    pass
            text = "\n".join(parts).strip()
            if text:
                return text, "pdfplumber"
    except Exception:
        pass

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        if text:
            return text, "pypdf"
    except Exception:
        pass

    return "", "none"


def extract_document_row_from_text(text: str, file_name: str, method: str = "text", document_type: str = "draft") -> dict:
    document_type = "received" if document_type == "received" else "draft"
    lines = [normalize_line(line) for line in text.splitlines() if normalize_line(line)]
    title_candidates = extract_title_candidates(lines, file_name)
    owner_candidates = extract_owner_candidates_from_pdf_text(text, lines)
    context_date_candidates = extract_context_date_candidates(text)
    title = title_candidates[0] if title_candidates else Path(file_name).stem
    sender_org = extract_sender_org_from_pdf_text(text, lines) if document_type == "received" else ""
    owner = sender_org if document_type == "received" and sender_org else (owner_candidates[0] if owner_candidates else "")
    department = extract_department_from_pdf_text(text, lines)
    doc_number = extract_doc_number_from_pdf_text(text)
    source_date_candidate = context_date_candidates[0] if context_date_candidates else None
    source_date = source_date_candidate.value if source_date_candidate else ""
    confidence, evidence = extraction_confidence_score(source_date, title, owner, department, title == Path(file_name).stem, sender_org, document_type)
    if method and method != "none":
        evidence = f"{evidence} (추출: {method})"
    status = extraction_status_details(source_date, title, owner, confidence, file_name, sender_org, document_type)
    if source_date_candidate and source_date_candidate.precision == "month":
        precision_reason = "월 단위 날짜 fallback - 날짜 확인"
        evidence = f"{evidence}, {precision_reason}"
        status = f"{status} / {precision_reason}" if status != "추출 완료" else precision_reason
    return {
        "date": source_date,
        "title": title,
        "owner": owner,
        "sender_org": sender_org,
        "document_type": document_type,
        "department": department,
        "doc_number": doc_number,
        "file_name": file_name,
        "date_candidates": format_labeled_candidates(context_date_candidates),
        "title_candidates": unique_join(title_candidates),
        "owner_candidates": unique_join(owner_candidates),
        "extraction_confidence": confidence,
        "extraction_evidence": evidence,
        "extract_status": status,
        "extraction_diagnosis": "정상 추출" if text else "텍스트 없음 - 수동 입력 필요",
    }


def extract_document_row_from_bytes(data: bytes, file_name: str, document_type: str = "draft") -> dict:
    document_type = "received" if document_type == "received" else "draft"
    text, method = extract_pdf_text_from_bytes(data)
    if not text:
        return {
            "date": "",
            "title": Path(file_name).stem,
            "owner": "",
            "sender_org": "",
            "document_type": document_type,
            "department": "",
            "doc_number": "",
            "file_name": file_name,
            "date_candidates": "",
            "title_candidates": Path(file_name).stem,
            "owner_candidates": "",
            "extraction_confidence": 0,
            "extraction_evidence": "텍스트 추출 불가",
            "extract_status": "텍스트 없음 - 수동 입력 필요",
            "extraction_diagnosis": "스캔 PDF이거나 텍스트가 없는 PDF일 수 있습니다",
        }
    return extract_document_row_from_text(text, file_name, method, document_type=document_type)


def convert_uploaded_pdfs_to_document_rows(files: Iterable[BinaryIO], document_type: str = "draft") -> list[dict]:
    rows: list[dict] = []
    for uploaded in files:
        file_name = getattr(uploaded, "filename", None) or getattr(uploaded, "name", None) or "document.pdf"
        data = uploaded.read()
        try:
            uploaded.seek(0)
        except Exception:
            pass
        rows.append(extract_document_row_from_bytes(data, str(file_name), document_type=document_type))
    return rows
