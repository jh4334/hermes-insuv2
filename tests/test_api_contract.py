from io import BytesIO

import app as app_module
from app import create_app


SAMPLE_LINES = "2025-03-10 업무지원과-0001 학교 안전점검 계획 / 담당: 담당자확인"


def test_api_analyze_exposes_versioned_contract_without_raw_document_text():
    client = create_app().test_client()

    res = client.post("/api/analyze", json={"targetYear": 2026, "documentLines": SAMPLE_LINES})

    assert res.status_code == 200
    payload = res.get_json()
    assert payload["contractVersion"] == "analyze.v1"
    assert payload["targetYear"] == 2026
    assert set(payload).issuperset({"board", "calendar", "monthLoad", "candidates", "errors"})
    assert "rawText" not in payload
    assert "pdfTextPreview" not in payload
    assert "documentLines" not in payload


def test_api_extract_pdfs_exposes_versioned_contract_and_hides_pdf_text(monkeypatch):
    def fake_convert(_files, document_type="draft"):
        return [
            {
                "date": "2025-03-10",
                "title": "학교 안전점검 계획",
                "owner": "담당자확인",
                "sender_org": "",
                "document_type": document_type,
                "department": "업무지원과",
                "doc_number": "업무지원과-0001",
                "file_name": "sample.pdf",
                "extraction_confidence": 95,
                "extract_status": "추출 완료",
                "extraction_evidence": "기안일·문서번호·담당 후보 확인",
                "pdf_text_preview": "원문 미노출 확인용 텍스트",
            }
        ]

    monkeypatch.setattr(app_module, "convert_uploaded_pdfs_to_document_rows", fake_convert)
    client = create_app().test_client()
    pdf = BytesIO(b"%PDF-1.4 fake body")

    res = client.post(
        "/api/extract-pdfs",
        data={"targetYear": "2026", "files": [(pdf, "sample.pdf")]},
        content_type="multipart/form-data",
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert payload["contractVersion"] == "extract-pdfs.v1"
    assert payload["analysis"]["contractVersion"] == "analyze.v1"
    assert payload["targetYear"] == 2026
    assert payload["documentLines"] == "2025-03-10 업무지원과-0001 학교 안전점검 계획 / 담당: 담당자확인"
    extracted = payload["extractedFiles"][0]
    assert set(extracted) == {
        "fileName",
        "sourceDate",
        "docNumber",
        "title",
        "owner",
        "senderOrg",
        "documentType",
        "department",
        "confidence",
        "status",
        "evidence",
    }
    assert "pdfTextPreview" not in extracted
    assert "원문 미노출" not in str(payload)


def test_api_extract_pdfs_keeps_received_documents_separate_and_uses_sender_org(monkeypatch):
    seen = {}

    def fake_convert(_files, document_type="draft"):
        seen["document_type"] = document_type
        return [
            {
                "date": "2025-03-10",
                "title": "학생수련활동 사전 신청 안내",
                "owner": "충청북도교육청",
                "sender_org": "충청북도교육청",
                "document_type": document_type,
                "department": "체육건강안전과",
                "doc_number": "체육건강안전과-4321",
                "file_name": "received.pdf",
                "extraction_confidence": 95,
                "extract_status": "추출 완료",
                "extraction_evidence": "날짜 추출, 제목 추출, 발신기관 추출",
            }
        ]

    monkeypatch.setattr(app_module, "convert_uploaded_pdfs_to_document_rows", fake_convert)
    client = create_app().test_client()
    pdf = BytesIO(b"%PDF-1.4 fake body")

    res = client.post(
        "/api/extract-pdfs",
        data={"targetYear": "2026", "documentType": "received", "files": [(pdf, "received.pdf")]},
        content_type="multipart/form-data",
    )

    assert res.status_code == 200
    payload = res.get_json()
    assert seen["document_type"] == "received"
    assert payload["documentLines"] == "2025-03-10 체육건강안전과-4321 학생수련활동 사전 신청 안내 / 발신기관: 충청북도교육청"
    extracted = payload["extractedFiles"][0]
    assert extracted["documentType"] == "received"
    assert extracted["senderOrg"] == "충청북도교육청"
    card = payload["analysis"]["board"]["cards"][0]
    assert card["documentType"] == "received"
    assert card["senderOrg"] == "충청북도교육청"
