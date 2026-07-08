import datetime as dt

from hermes_insu.domain import (
    DocumentSeed,
    build_markdown_export,
    build_operations_board,
    build_workflow_calendar,
    infer_stage,
    parse_document_line,
    summarize_month_load,
)


def test_parse_document_line_extracts_date_doc_number_title_owner_and_reference():
    seed = parse_document_line("2025-05-28 샘플초등학교-4786 4학년 현장체험학습 계획 수립 / 담당: 김교사")

    assert seed.source_date == dt.date(2025, 5, 28)
    assert seed.doc_number == "샘플초등학교-4786"
    assert seed.title == "4학년 현장체험학습 계획 수립"
    assert seed.owner == "김교사"
    assert seed.reference_label == "샘플초등학교-4786 (25.05.28.)"


def test_build_operations_board_rolls_forward_and_keeps_handover_as_optional_postit():
    seeds = [
        DocumentSeed(
            source_date=dt.date(2025, 5, 28),
            title="2025학년도 4학년 현장체험학습 계획 수립",
            doc_number="샘플초등학교-4786",
            owner="김교사",
            reference_location="K-에듀파인 공문함 > 2025 > 5월",
        )
    ]

    board = build_operations_board(seeds, target_year=2026)

    assert board.target_year == 2026
    assert len(board.cards) == 1
    card = board.cards[0]
    assert card.target_date == dt.date(2026, 5, 28)
    assert "2026학년도" in card.title
    assert card.source_title == "2025학년도 4학년 현장체험학습 계획 수립"
    assert card.reference_label == "샘플초등학교-4786 (25.05.28.)"
    assert card.memo_label == "포스트잇형 참고 메모"
    assert card.required_handover is False


def test_infer_stage_only_chips_explicit_workflow_keywords():
    titles = [
        "교육과정 운영 계획",
        "현장체험학습 신청 품의",
        "학년말 평가 결과보고",
        "예산 계약 및 물품 구매 정산",
        "교육활동 결과물 전시 자료 제작",
        "보고서 및 정산서 제출",
        "[제출] 2026년 북한배경학생 현황",
        "북한배경학생 현황",
        "맞춤형 멘토링 지원 사업 신청서",
        "[제출] 맞춤형 멘토링 지원 사업 신청서",
        "일반 안내",
    ]

    stages = [infer_stage(title) for title in titles]

    assert stages == ["계획", "품의", "결과보고", "품의", "품의", "결과보고", "", "", "", "", "계획"]
    assert set(stages) <= {"", "계획", "품의", "결과보고"}


def test_summarize_month_load_identifies_peak_months_without_fake_metrics():
    seeds = [
        DocumentSeed(dt.date(2025, 3, 1), "학년 교육과정 계획", "A-1", "교무"),
        DocumentSeed(dt.date(2025, 3, 8), "학부모 상담 계획", "A-2", "상담"),
        DocumentSeed(dt.date(2025, 5, 2), "현장체험학습 계획", "A-3", "체험"),
    ]
    board = build_operations_board(seeds, target_year=2026)

    summary = summarize_month_load(board.cards)

    assert summary[3] == 2
    assert summary[5] == 1
    assert summary.peak_months == [3]


def test_build_workflow_calendar_groups_cards_by_month_and_week():
    seeds = [
        DocumentSeed(dt.date(2025, 5, 1), "안전교육 운영", "A-1", "안전"),
        DocumentSeed(dt.date(2025, 5, 28), "현장체험학습 계획", "A-2", "체험"),
        DocumentSeed(dt.date(2025, 12, 2), "학년말 평가 결과보고", "A-3", "평가"),
    ]
    board = build_operations_board(seeds, target_year=2026)

    workflow = build_workflow_calendar(board.cards, target_year=2026)

    assert workflow["targetYear"] == 2026
    assert [month["month"] for month in workflow["months"]] == [5, 12]
    may = workflow["months"][0]
    assert may["label"] == "5월"
    assert may["totalCards"] == 2
    assert [week["label"] for week in may["weeks"]] == ["5월 1주", "5월 5주"]
    assert may["weeks"][0]["startDate"] == "2026-05-01"
    assert may["weeks"][0]["endDate"] == "2026-05-02"
    assert may["weeks"][0]["cards"][0]["title"] == "안전교육 운영"
    assert may["weeks"][1]["cards"][0]["targetDate"] == "2026-05-28"


def test_build_markdown_export_includes_plan_review_list_and_no_fake_results():
    seeds = [
        DocumentSeed(dt.date(2025, 5, 1), "안전교육 운영", "문서번호 미입력", "담당자 미입력"),
        DocumentSeed(dt.date(2025, 12, 2), "학년말 평가 결과보고", "A-3", "평가"),
    ]
    board = build_operations_board(seeds, target_year=2026)

    markdown = build_markdown_export(board, seeds)

    assert "## 운영 계획" in markdown
    assert "2026-05-01" in markdown
    assert "문서번호 미입력" in markdown
    assert "담당자 미입력" in markdown
    assert "[입력 예정]" in markdown
    assert "[ ]" in markdown
    assert "파일럿 결과" not in markdown
    assert "80%" not in markdown
