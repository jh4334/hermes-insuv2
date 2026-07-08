from __future__ import annotations

import calendar
import datetime as dt
import re
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class DocumentSeed:
    source_date: dt.date
    title: str
    doc_number: str
    owner: str
    reference_location: str = "K-에듀파인 또는 공문함"
    document_type: str = "draft"
    sender_org: str = ""

    @property
    def reference_label(self) -> str:
        return f"{self.doc_number} ({self.source_date:%y.%m.%d.})"


@dataclass(frozen=True)
class OperationCard:
    target_date: dt.date
    title: str
    source_title: str
    source_date: dt.date
    doc_number: str
    owner: str
    reference_label: str
    reference_location: str
    stage: str
    document_type: str = "draft"
    sender_org: str = ""
    memo_label: str = "포스트잇형 참고 메모"
    required_handover: bool = False
    memo: str = ""


@dataclass(frozen=True)
class OperationsBoard:
    target_year: int
    cards: list[OperationCard]


class MonthLoadSummary(dict):
    @property
    def peak_months(self) -> list[int]:
        if not self:
            return []
        peak = max(self.values())
        return [month for month, count in sorted(self.items()) if count == peak]


DATE_RE = re.compile(r"(?P<year>20\d{2})[-./년 ]\s*(?P<month>\d{1,2})[-./월 ]\s*(?P<day>\d{1,2})")
DOC_RE = re.compile(r"(?P<doc>[가-힣A-Za-z_·.][가-힣A-Za-z0-9_·.]*-\d{1,8})")
OWNER_RE = re.compile(r"(?:담당|담당자|기안자)\s*[:：]?\s*(?P<owner>[가-힣A-Za-z0-9_]+)")
SENDER_ORG_RE = re.compile(r"(?:발신기관|발신|보낸기관|시행기관)\s*[:：]?\s*(?P<sender>[가-힣A-Za-z0-9_·.()\- ]+)")


def parse_document_line(line: str) -> DocumentSeed:
    """Parse one user-pasted public document line into a safe seed record.

    The parser intentionally handles only surface metadata. Raw PDFs/files are not
    stored in this new MVP; successors find evidence through date + document number
    + reference location.
    """
    text = " ".join(line.strip().split())
    if not text:
        raise ValueError("empty document line")

    date_match = DATE_RE.search(text)
    if not date_match:
        raise ValueError("기안일을 찾을 수 없습니다. 예: 2025-05-28")
    source_date = dt.date(
        int(date_match.group("year")), int(date_match.group("month")), int(date_match.group("day"))
    )

    doc_match = DOC_RE.search(text)
    doc_number = doc_match.group("doc") if doc_match else "문서번호 미입력"

    owner_match = OWNER_RE.search(text)
    owner = owner_match.group("owner") if owner_match else "담당자 미입력"
    sender_match = SENDER_ORG_RE.search(text)
    sender_org = sender_match.group("sender").strip(" /·,-:：") if sender_match else ""
    document_type = "received" if sender_org else "draft"
    if sender_org:
        owner = sender_org

    title = text
    for match in [date_match, doc_match, owner_match, sender_match]:
        if match:
            title = title.replace(match.group(0), " ")
    title = re.sub(r"[/|·,:：-]+\s*$", "", title)
    title = re.sub(r"\s+", " ", title).strip(" /·,-:：")
    if not title:
        title = "업무명 미입력"

    return DocumentSeed(source_date=source_date, title=title, doc_number=doc_number, owner=owner, document_type=document_type, sender_org=sender_org)


def roll_forward_date(source_date: dt.date, target_year: int) -> dt.date:
    last_day = calendar.monthrange(target_year, source_date.month)[1]
    return dt.date(target_year, source_date.month, min(source_date.day, last_day))


def roll_forward_title(title: str, target_year: int) -> str:
    result = title
    result = re.sub(r"20\d{2}(?=학년도|년)", str(target_year), result)
    result = re.sub(r"(?<!\d)\d{2}(?=학년도)", f"{target_year % 100:02d}", result)
    return result


def infer_stage(title: str) -> str:
    if "제출" in title and not any(keyword in title for keyword in ("결과보고", "결과 보고", "보고서")):
        return ""
    if "품의" in title:
        return "품의"
    if any(keyword in title for keyword in ("결과보고", "결과 보고", "보고서")):
        return "결과보고"
    if "결과" in title and "결과물" not in title:
        return "결과보고"
    if any(keyword in title for keyword in ("예산", "계약", "회계", "물품", "구매", "구입", "제작", "대여", "지출", "지급", "정산", "지원금", "연수비", "구독료", "다과", "음료", "현수막", "배너", "시설비")):
        return "품의"
    if any(keyword in title for keyword in ("현황", "신청서")):
        return ""
    return "계획"


def build_operations_board(seeds: Iterable[DocumentSeed], target_year: int) -> OperationsBoard:
    cards = [
        OperationCard(
            target_date=roll_forward_date(seed.source_date, target_year),
            title=roll_forward_title(seed.title, target_year),
            source_title=seed.title,
            source_date=seed.source_date,
            doc_number=seed.doc_number,
            owner=seed.owner,
            reference_label=seed.reference_label,
            reference_location=seed.reference_location,
            stage=infer_stage(seed.title),
            document_type=seed.document_type,
            sender_org=seed.sender_org,
        )
        for seed in seeds
    ]
    cards.sort(key=lambda card: (card.target_date, card.title))
    return OperationsBoard(target_year=target_year, cards=cards)


def summarize_month_load(cards: Iterable[OperationCard]) -> MonthLoadSummary:
    summary = MonthLoadSummary()
    for card in cards:
        summary[card.target_date.month] = summary.get(card.target_date.month, 0) + 1
    return summary


def _card_export_dict(card: OperationCard) -> dict:
    return {
        "targetDate": card.target_date.isoformat(),
        "title": card.title,
        "docNumber": card.doc_number,
        "owner": card.owner,
        "stage": card.stage,
        "referenceLabel": card.reference_label,
        "referenceLocation": card.reference_location,
    }


def build_workflow_calendar(cards: Iterable[OperationCard], target_year: int) -> dict:
    """Build a deterministic month/week workflow view from analyzed cards only."""
    cards_by_month_week: dict[int, dict[int, list[OperationCard]]] = {}
    for card in sorted(cards, key=lambda item: (item.target_date, item.title)):
        month = card.target_date.month
        first_weekday = (dt.date(target_year, month, 1).weekday() + 1) % 7
        week = ((first_weekday + card.target_date.day - 1) // 7) + 1
        cards_by_month_week.setdefault(month, {}).setdefault(week, []).append(card)

    months = []
    for month in sorted(cards_by_month_week):
        weeks = []
        total_cards = 0
        last_day = calendar.monthrange(target_year, month)[1]
        first_weekday = (dt.date(target_year, month, 1).weekday() + 1) % 7
        for week in sorted(cards_by_month_week[month]):
            start_day = max(1, 1 - first_weekday + ((week - 1) * 7))
            end_day = min(last_day, 7 - first_weekday + ((week - 1) * 7))
            week_cards = cards_by_month_week[month][week]
            total_cards += len(week_cards)
            weeks.append(
                {
                    "week": week,
                    "label": f"{month}월 {week}주",
                    "startDate": dt.date(target_year, month, start_day).isoformat(),
                    "endDate": dt.date(target_year, month, end_day).isoformat(),
                    "count": len(week_cards),
                    "cards": [_card_export_dict(card) for card in week_cards],
                }
            )
        months.append({"month": month, "label": f"{month}월", "totalCards": total_cards, "weeks": weeks})

    return {"targetYear": target_year, "months": months}


def build_markdown_export(board: OperationsBoard, seeds: Iterable[DocumentSeed]) -> str:
    """Create download/copy-ready Markdown with no fabricated measurement results."""
    lines = [
        f"# {board.target_year}년 올해 업무 실행판 export",
        "",
        "## 운영 계획",
    ]
    if board.cards:
        for card in board.cards:
            lines.extend(
                [
                    f"- [ ] {card.target_date.isoformat()} · {card.stage} · {card.title}",
                    f"  - 담당/확인: {card.owner}",
                    f"  - 근거: {card.reference_label}",
                    f"  - 참고자료 위치: {card.reference_location}",
                    f"  - {card.memo_label}: [입력 예정]",
                ]
            )
    else:
        lines.append("- [입력 예정] 운영 계획 항목 없음")

    return "\n".join(lines) + "\n"
