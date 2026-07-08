from __future__ import annotations

from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_from_directory

from hermes_insu.domain import (
    DocumentSeed,
    OperationCard,
    build_markdown_export,
    build_operations_board,
    build_workflow_calendar,
    parse_document_line,
    summarize_month_load,
)
from hermes_insu.pdf_extract import convert_uploaded_pdfs_to_document_rows

SAMPLE_LINES = """2025-03-04 샘플초등학교-1023 2025학년도 학년 교육과정 운영 계획 / 담당: 교무
2025-05-28 샘플초등학교-4786 2025학년도 4학년 현장체험학습 계획 수립 / 담당: 김교사
2025-12-02 샘플초등학교-9012 학년말 평가 결과보고 / 담당: 이교사"""


def parse_document_lines(raw_lines: str) -> tuple[list[DocumentSeed], list[str]]:
    seeds: list[DocumentSeed] = []
    errors: list[str] = []
    for pos, line in enumerate(raw_lines.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            seeds.append(parse_document_line(line))
        except ValueError as exc:
            errors.append(f"{pos}행: {exc}")
    return seeds, errors


def candidate_to_json(seed: DocumentSeed, index: int) -> dict:
    return {
        "id": f"candidate-{index}",
        "sourceDate": seed.source_date.isoformat(),
        "docNumber": seed.doc_number,
        "title": seed.title,
        "owner": seed.owner,
        "referenceLabel": seed.reference_label,
        "referenceLocation": seed.reference_location,
    }


def card_to_json(card: OperationCard) -> dict:
    return {
        "targetDate": card.target_date.isoformat(),
        "title": card.title,
        "sourceTitle": card.source_title,
        "sourceDate": card.source_date.isoformat(),
        "docNumber": card.doc_number,
        "owner": card.owner,
        "senderOrg": card.sender_org,
        "documentType": card.document_type,
        "referenceLabel": card.reference_label,
        "referenceLocation": card.reference_location,
        "stage": card.stage,
        "memoLabel": card.memo_label,
        "requiredHandover": card.required_handover,
        "memo": card.memo,
    }


def analysis_payload(raw_lines: str, target_year: int) -> dict:
    seeds, errors = parse_document_lines(raw_lines)
    board = build_operations_board(seeds, target_year=target_year)
    month_load = summarize_month_load(board.cards)
    workflow = build_workflow_calendar(board.cards, target_year=target_year)
    return {
        "contractVersion": "analyze.v1",
        "targetYear": board.target_year,
        "candidates": [candidate_to_json(seed, index) for index, seed in enumerate(seeds, start=1)],
        "monthLoad": {str(month): count for month, count in sorted(month_load.items())},
        "board": {
            "targetYear": board.target_year,
            "cards": [card_to_json(card) for card in board.cards],
            "monthLoad": {str(month): count for month, count in sorted(month_load.items())},
            "peakMonths": month_load.peak_months,
            },
        "workflow": workflow,
        "calendar": workflow,
        "errors": errors,
    }


def export_payload(raw_lines: str, target_year: int, export_format: str = "markdown") -> str:
    seeds, _errors = parse_document_lines(raw_lines)
    board = build_operations_board(seeds, target_year=target_year)
    return build_markdown_export(board, seeds)


def request_json_payload() -> object:
    if not request.is_json:
        return None
    return request.get_json(silent=True)


def coerce_target_year(target_year_value: object, messages: list[str]) -> int:
    if target_year_value is None or target_year_value == "":
        target_year_value = 2026
    if isinstance(target_year_value, bool):
        messages.append("targetYear must be a number such as 2026.")
        return 2026
    try:
        target_year = int(target_year_value)
    except (TypeError, ValueError):
        messages.append("targetYear must be a number such as 2026.")
        return 2026
    if target_year < 1900 or target_year > 9999:
        messages.append("targetYear must be between 1900 and 9999.")
    return target_year


def validated_api_payload(data: object) -> tuple[str, int, list[str]]:
    messages: list[str] = []
    if not isinstance(data, dict):
        return "", 2026, ["Request body must be a JSON object."]

    raw_lines = data.get("documentLines", data.get("document_lines", ""))
    if not isinstance(raw_lines, str):
        messages.append("documentLines must be a string containing pasted document metadata lines.")
        raw_lines = ""

    target_year = coerce_target_year(data.get("targetYear", data.get("target_year", 2026)), messages)
    return raw_lines, target_year, messages


def pdf_row_to_document_line(row: dict) -> str:
    source_date = str(row.get("date") or "").strip()
    doc_number = str(row.get("doc_number") or "문서번호 미입력").strip() or "문서번호 미입력"
    title = str(row.get("title") or row.get("file_name") or "업무명 미입력").strip() or "업무명 미입력"
    document_type = str(row.get("document_type") or "draft").strip()
    if document_type == "received":
        sender_org = str(row.get("sender_org") or row.get("owner") or "발신기관 미입력").strip() or "발신기관 미입력"
        if not source_date:
            return f"{title} {doc_number} / 발신기관: {sender_org}"
        return f"{source_date} {doc_number} {title} / 발신기관: {sender_org}"
    owner = str(row.get("owner") or "담당자 미입력").strip() or "담당자 미입력"
    if not source_date:
        return f"{title} {doc_number} / 담당: {owner}"
    return f"{source_date} {doc_number} {title} / 담당: {owner}"


def extracted_file_to_json(row: dict) -> dict:
    return {
        "fileName": row.get("file_name", ""),
        "sourceDate": row.get("date", ""),
        "docNumber": row.get("doc_number", ""),
        "title": row.get("title", ""),
        "owner": row.get("owner", ""),
        "senderOrg": row.get("sender_org", ""),
        "documentType": row.get("document_type", "draft"),
        "department": row.get("department", ""),
        "confidence": row.get("extraction_confidence", 0),
        "status": row.get("extract_status", ""),
        "evidence": row.get("extraction_evidence", ""),
    }


def uploaded_file_has_pdf_header(uploaded_file) -> bool:
    head = uploaded_file.read(5)
    try:
        uploaded_file.seek(0)
    except Exception:
        pass
    return head == b"%PDF-"


def create_app(frontend_dist: str | Path | None = None, prefer_react: bool = False) -> Flask:
    app = Flask(__name__)
    frontend_dist_path = Path(frontend_dist) if frontend_dist is not None else Path(__file__).parent / "frontend" / "dist"
    serve_react = prefer_react and (frontend_dist_path / "index.html").exists()

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "hermes-insu"}

    @app.get("/api/health")
    def api_health():
        return jsonify({"status": "ok", "service": "hermes-insu"})

    @app.post("/api/analyze")
    def api_analyze():
        data = request_json_payload()
        raw_lines, target_year, messages = validated_api_payload(data)
        if messages:
            return jsonify({"error": "invalid_request", "messages": messages}), 400
        return jsonify(analysis_payload(raw_lines, target_year))

    @app.post("/api/board")
    def api_board():
        data = request_json_payload()
        raw_lines, target_year, messages = validated_api_payload(data)
        if messages:
            return jsonify({"error": "invalid_request", "messages": messages}), 400
        return jsonify(analysis_payload(raw_lines, target_year)["board"])

    @app.post("/api/extract-pdfs")
    def api_extract_pdfs():
        messages: list[str] = []
        target_year = coerce_target_year(request.form.get("targetYear", request.form.get("target_year", 2026)), messages)
        files = [file for file in request.files.getlist("files") if file and file.filename]
        invalid_files = [file.filename for file in files if not file.filename.lower().endswith(".pdf")]
        non_pdf_files = [file.filename for file in files if file.filename.lower().endswith(".pdf") and not uploaded_file_has_pdf_header(file)]
        if not files:
            messages.append("PDF 파일을 1개 이상 선택하세요.")
        if invalid_files:
            messages.append("PDF 파일만 업로드할 수 있습니다: " + ", ".join(invalid_files))
        if non_pdf_files:
            messages.append("PDF 형식이 아닌 파일이 포함되어 있습니다: " + ", ".join(non_pdf_files))
        if messages:
            return jsonify({"error": "invalid_request", "messages": messages}), 400

        document_type = "received" if request.form.get("documentType", request.form.get("document_type", "draft")) == "received" else "draft"
        rows = convert_uploaded_pdfs_to_document_rows(files, document_type=document_type)
        document_lines = "\n".join(pdf_row_to_document_line(row) for row in rows)
        return jsonify(
            {
                "contractVersion": "extract-pdfs.v1",
                "targetYear": target_year,
                "documentLines": document_lines,
                "extractedFiles": [extracted_file_to_json(row) for row in rows],
                "analysis": analysis_payload(document_lines, target_year),
            }
        )

    @app.post("/api/export")
    def api_export():
        data = request_json_payload()
        raw_lines, target_year, messages = validated_api_payload(data)
        export_format = "markdown"
        if isinstance(data, dict):
            export_format = data.get("format", "markdown")
        if export_format == "csv":
            messages.append("CSV 내보내기는 더 이상 지원하지 않습니다. 업무묶음 DOCX 또는 Markdown을 사용하세요.")
        elif export_format != "markdown":
            messages.append("format must be markdown.")
        if messages:
            return jsonify({"error": "invalid_request", "messages": messages}), 400

        return Response(
            export_payload(raw_lines, target_year, "markdown"),
            mimetype="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=hermes-insu-{target_year}-plan.md"},
        )

    @app.get("/")
    def home():
        if serve_react:
            return send_from_directory(frontend_dist_path, "index.html")
        return render_template("index.html", sample_lines=SAMPLE_LINES, board=None, errors=[])

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str):
        if serve_react:
            return send_from_directory(frontend_dist_path / "assets", filename)
        return "Not found", 404

    @app.post("/analyze")
    def analyze():
        return jsonify({
            "error": "legacy_route_removed",
            "message": "이전 분석 화면은 제거되었습니다. PDF 업로드 흐름 또는 /api/analyze JSON API를 사용하세요.",
        }), 410

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5001, debug=True)
