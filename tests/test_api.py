from io import BytesIO

from app import create_app


SAMPLE_DOCUMENT_LINES = (
    "2025-05-28 샘플초등학교-4786 2025학년도 4학년 현장체험학습 계획 수립 / 담당: 김교사\n"
    "2025-12-02 샘플초등학교-9012 학년말 평가 결과보고 / 담당: 이교사"
)


def test_api_health_returns_json_contract():
    app = create_app()
    client = app.test_client()

    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.content_type.startswith("application/json")
    assert res.get_json() == {"status": "ok", "service": "hermes-insu"}


def test_api_extract_pdfs_accepts_multiple_files_and_returns_analysis(monkeypatch):
    app = create_app()
    client = app.test_client()

    def fake_extract(files, document_type="draft"):
        assert document_type == "draft"
        names = [item.filename for item in files]
        assert names == ["first.pdf", "second.pdf"]
        return [
            {
                "date": "2025-03-04",
                "title": "2025학년도 학부모 공개수업 운영 계획",
                "owner": "김교사",
                "department": "교무부",
                "doc_number": "샘플초-1001",
                "file_name": "first.pdf",
                "extraction_confidence": 95,
                "extract_status": "추출 완료",
                "extraction_evidence": "날짜 추출, 제목 추출, 담당자 추출",
            },
            {
                "date": "2025-05-08",
                "title": "2025학년도 현장체험학습 안전 점검",
                "owner": "이교사",
                "department": "생활안전부",
                "doc_number": "샘플초-2002",
                "file_name": "second.pdf",
                "extraction_confidence": 90,
                "extract_status": "추출 완료",
                "extraction_evidence": "날짜 추출, 제목 추출, 담당자 추출",
            },
        ]

    monkeypatch.setattr("app.convert_uploaded_pdfs_to_document_rows", fake_extract)
    res = client.post(
        "/api/extract-pdfs",
        data={
            "targetYear": "2026",
            "files": [
                (BytesIO(b"%PDF-1.4 dummy pdf 1"), "first.pdf"),
                (BytesIO(b"%PDF-1.4 dummy pdf 2"), "second.pdf"),
            ],
        },
        content_type="multipart/form-data",
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert payload["targetYear"] == 2026
    assert [item["fileName"] for item in payload["extractedFiles"]] == ["first.pdf", "second.pdf"]
    assert "preview" not in payload["extractedFiles"][0]
    assert "2025-03-04 샘플초-1001 2025학년도 학부모 공개수업 운영 계획 / 담당: 김교사" in payload["documentLines"]
    assert "2025-05-08 샘플초-2002 2025학년도 현장체험학습 안전 점검 / 담당: 이교사" in payload["documentLines"]
    assert len(payload["analysis"]["candidates"]) == 2
    assert payload["analysis"]["board"]["cards"][0]["title"] == "2026학년도 학부모 공개수업 운영 계획"


def test_api_extract_pdfs_does_not_cap_file_count_at_twenty(monkeypatch):
    app = create_app()
    client = app.test_client()

    def fake_extract(files, document_type="draft"):
        assert document_type == "draft"
        names = [item.filename for item in files]
        assert len(names) == 21
        return [
            {
                "date": "2025-03-04",
                "title": f"2025학년도 업무 계획 {index}",
                "owner": "김교사",
                "department": "교무부",
                "doc_number": f"샘플초-{1000 + index}",
                "file_name": name,
                "extraction_confidence": 95,
                "extract_status": "추출 완료",
                "extraction_evidence": "날짜 추출, 제목 추출, 담당자 추출",
            }
            for index, name in enumerate(names, start=1)
        ]

    monkeypatch.setattr("app.convert_uploaded_pdfs_to_document_rows", fake_extract)
    files = [(BytesIO(b"%PDF-1.4 dummy pdf"), f"batch-{index}.pdf") for index in range(1, 22)]

    res = client.post(
        "/api/extract-pdfs",
        data={"targetYear": "2026", "files": files},
        content_type="multipart/form-data",
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert len(payload["extractedFiles"]) == 21
    assert len(payload["analysis"]["board"]["cards"]) == 21


def test_api_extract_pdfs_rejects_missing_files_without_500():
    app = create_app()
    client = app.test_client()

    res = client.post("/api/extract-pdfs", data={"targetYear": "2026"})

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("PDF" in message for message in payload["messages"])


def test_api_extract_pdfs_rejects_renamed_non_pdf_payload():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/extract-pdfs",
        data={"files": [(BytesIO(b"not actually a pdf"), "renamed.pdf")]},
        content_type="multipart/form-data",
    )

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("PDF 형식" in message for message in payload["messages"])


def test_api_extract_pdfs_enforces_a_request_size_limit():
    # Policy change (C5): a local server must cap request size so a huge
    # multipart upload cannot exhaust memory. Previously this was intentionally
    # unset; it is now bounded at 64MB.
    app = create_app()

    assert app.config.get("MAX_CONTENT_LENGTH") == 64 * 1024 * 1024


def test_api_analyze_returns_candidates_and_operations_board_json_contract():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/analyze",
        json={"targetYear": 2026, "documentLines": SAMPLE_DOCUMENT_LINES},
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert payload["targetYear"] == 2026
    assert payload["errors"] == []

    assert payload["candidates"][0] == {
        "id": "candidate-1",
        "sourceDate": "2025-05-28",
        "docNumber": "샘플초등학교-4786",
        "title": "2025학년도 4학년 현장체험학습 계획 수립",
        "owner": "김교사",
        "referenceLabel": "샘플초등학교-4786 (25.05.28.)",
        "referenceLocation": "K-에듀파인 또는 공문함",
    }

    board = payload["board"]
    assert board["targetYear"] == 2026
    assert board["cards"][0]["targetDate"] == "2026-05-28"
    assert board["cards"][0]["title"] == "2026학년도 4학년 현장체험학습 계획 수립"
    assert board["cards"][0]["stage"] == "계획"
    assert board["cards"][0]["memoLabel"] == "포스트잇형 참고 메모"
    assert board["cards"][0]["requiredHandover"] is False
    assert board["monthLoad"] == {"5": 1, "12": 1}
    assert board["peakMonths"] == [5, 12]


def test_api_analyze_omits_legacy_review_queue_fields():
    app = create_app()
    client = app.test_client()

    raw_lines = (
        "추출 실패 줄\n"
        "2025-05-01 2025학년도 안전교육 운영\n"
        "2025-05-12 샘플초등학교-2002 2025학년도 체험학습 계획 / 담당: 김교사"
    )

    res = client.post(
        "/api/analyze",
        json={"targetYear": 2026, "documentLines": raw_lines},
    )

    assert res.status_code == 200
    payload = res.get_json()
    legacy_queue_key = "review" + "Queue"
    assert legacy_queue_key not in payload
    assert legacy_queue_key not in payload["board"]
    assert payload["errors"] == ["1행: 기안일을 찾을 수 없습니다. 예: 2025-05-28"]


def test_api_analyze_includes_workflow_calendar_payload():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/analyze",
        json={"targetYear": 2026, "documentLines": SAMPLE_DOCUMENT_LINES},
    )

    assert res.status_code == 200
    workflow = res.get_json()["workflow"]
    assert workflow["targetYear"] == 2026
    assert [month["label"] for month in workflow["months"]] == ["5월", "12월"]
    assert workflow["months"][0]["totalCards"] == 1
    assert workflow["months"][0]["weeks"][0]["label"] == "5월 5주"
    assert workflow["months"][0]["weeks"][0]["cards"][0]["title"] == "2026학년도 4학년 현장체험학습 계획 수립"


def test_api_export_returns_markdown_plan_without_fake_metrics():
    app = create_app()
    client = app.test_client()

    raw_lines = "2025-05-01 2025학년도 안전교육 운영\n" + SAMPLE_DOCUMENT_LINES
    res = client.post(
        "/api/export",
        json={"targetYear": 2026, "documentLines": raw_lines, "format": "markdown"},
    )

    assert res.status_code == 200
    assert res.content_type.startswith("text/markdown")
    assert "attachment; filename=hermes-insu-2026-plan.md" in res.headers["Content-Disposition"]
    text = res.get_data(as_text=True)
    assert "## 운영 계획" in text
    assert "2026학년도 안전교육 운영" in text
    assert "문서번호 미입력" in text
    assert "담당자 미입력" in text
    assert "[입력 예정]" in text
    assert "파일럿 결과" not in text
    assert "80%" not in text


def test_api_export_rejects_csv_format_after_frontend_csv_removal():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/export",
        json={"targetYear": 2026, "documentLines": SAMPLE_DOCUMENT_LINES, "format": "csv"},
    )

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("CSV" in message and "지원하지 않습니다" in message for message in payload["messages"])


def test_api_export_rejects_unsupported_format_with_validation_contract():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/export",
        json={"targetYear": 2026, "documentLines": SAMPLE_DOCUMENT_LINES, "format": "pdf"},
    )

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("format" in message for message in payload["messages"])


def test_api_analyze_reports_line_errors_without_blocking_valid_candidates():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/api/analyze",
        json={"targetYear": 2026, "documentLines": "날짜 없는 줄\n" + SAMPLE_DOCUMENT_LINES},
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert len(payload["candidates"]) == 2
    assert payload["errors"] == ["1행: 기안일을 찾을 수 없습니다. 예: 2025-05-28"]


def test_api_analyze_rejects_malformed_json_contract_without_500():
    app = create_app()
    client = app.test_client()

    res = client.post("/api/analyze", json={"targetYear": "not-a-year", "documentLines": []})

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("targetYear" in message for message in payload["messages"])
    assert any("documentLines" in message for message in payload["messages"])


def test_api_board_rejects_malformed_json_contract_without_500():
    app = create_app()
    client = app.test_client()

    res = client.post("/api/board", json={"targetYear": "not-a-year", "documentLines": []})

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("targetYear" in message for message in payload["messages"])
    assert any("documentLines" in message for message in payload["messages"])


def test_api_analyze_rejects_non_object_json_without_500():
    app = create_app()
    client = app.test_client()

    res = client.post("/api/analyze", json=["not", "object"])

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("JSON object" in message for message in payload["messages"])


def test_api_board_rejects_non_object_json_without_500():
    app = create_app()
    client = app.test_client()

    res = client.post("/api/board", json=["not", "object"])

    assert res.status_code == 400
    payload = res.get_json()
    assert payload["error"] == "invalid_request"
    assert any("JSON object" in message for message in payload["messages"])


def test_api_analyze_rejects_falsey_non_object_json_without_500():
    app = create_app()
    client = app.test_client()

    for body in ([], None, "", 0, False):
        res = client.post("/api/analyze", json=body)

        assert res.status_code == 400
        payload = res.get_json()
        assert payload["error"] == "invalid_request"
        assert any("JSON object" in message for message in payload["messages"])


def test_api_analyze_rejects_out_of_range_target_year_without_500():
    app = create_app()
    client = app.test_client()

    for target_year in (-1, 0, False, 10000):
        res = client.post(
            "/api/analyze",
            json={"targetYear": target_year, "documentLines": SAMPLE_DOCUMENT_LINES},
        )

        assert res.status_code == 400
        payload = res.get_json()
        assert payload["error"] == "invalid_request"
        assert any("targetYear" in message for message in payload["messages"])


def test_extract_pdfs_rejects_too_many_files():
    app = create_app()
    client = app.test_client()
    payload = {"targetYear": "2026", "files": [(BytesIO(b"%PDF-1.4 x"), f"d{i}.pdf") for i in range(61)]}
    resp = client.post("/api/extract-pdfs", data=payload, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert any("최대" in m for m in resp.get_json()["messages"])


def test_request_too_large_returns_413_json():
    app = create_app()
    # shrink the limit for the test so we don't allocate 64MB
    app.config["MAX_CONTENT_LENGTH"] = 1024
    client = app.test_client()
    big = b"x" * 5000
    resp = client.post("/api/extract-pdfs", data={"files": (BytesIO(big), "big.pdf")}, content_type="multipart/form-data")
    assert resp.status_code == 413
    body = resp.get_json()
    assert body["error"] == "request_too_large"


def test_max_content_length_is_configured():
    app = create_app()
    assert app.config["MAX_CONTENT_LENGTH"] == 64 * 1024 * 1024
