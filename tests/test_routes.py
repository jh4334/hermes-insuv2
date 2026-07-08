from app import create_app


def test_homepage_fallback_points_to_pdf_first_react_frontend():
    app = create_app()
    client = app.test_client()

    res = client.get("/")
    html = res.get_data(as_text=True)

    assert res.status_code == 200
    assert "공문 PDF를 업무 카드와 캘린더 흐름으로" in html
    assert "프론트엔드 빌드가 필요합니다" in html
    assert "PDF 업로드 흐름" in html
    assert "메타데이터 붙여넣기" not in html
    assert "인수인계 문서를 새로 쓰게 하는 앱" not in html


def test_legacy_analyze_route_is_gone_after_pdf_first_frontend():
    app = create_app()
    client = app.test_client()

    res = client.post(
        "/analyze",
        data={
            "target_year": "2026",
            "document_lines": "2025-05-28 샘플초등학교-4786 4학년 현장체험학습 계획 수립 / 담당: 김교사\n"
            "2025-12-02 샘플초등학교-9012 학년말 평가 결과보고 / 담당: 이교사",
        },
    )

    assert res.status_code == 410
    payload = res.get_json()
    assert payload["error"] == "legacy_route_removed"
    assert "PDF 업로드" in payload["message"]
