from hermes_insu.pdf_extract import extract_context_date_candidates, extract_document_row_from_text


def test_extract_document_row_does_not_keep_raw_pdf_text_preview_in_internal_row():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    ★교무부 2027. 6. 5.
    교사 홍길동 교감 김관리 교장
    시행 샘플부-1234 ( )
    """

    row = extract_document_row_from_text(text, "sanitized-no-preview.pdf")

    assert "pdf_text_preview" not in row


def test_extract_received_document_row_uses_sender_org_instead_of_internal_owner():
    text = """
    충청북도교육청
    수신 수신자 참조
    제목 2025학년도 학생수련활동 사전 신청 안내
    1. 신청기간: 2025. 3. 20.(목) 09:00부터 선착순 접수
    시행 체육건강안전과-4321 (2025. 3. 10.)
    담당자 홍길동
    """

    row = extract_document_row_from_text(text, "received-training.pdf", document_type="received")

    assert row["document_type"] == "received"
    assert row["sender_org"] == "충청북도교육청"
    assert row["owner"] == "충청북도교육청"
    assert "발신기관 추출" in row["extraction_evidence"]


def test_extract_document_row_uses_dotted_approval_month_as_reviewed_fallback():
    # Given: sanitized extracted text where the approval line has only year/month.
    text = """
    결재 대결 2025. 2.
    시행 부서-1234 ( )
    제목 2025학년도 업무 실행 계획
    담당자 테스트
    """

    # When: the PDF text is converted into the app's extracted row contract.
    row = extract_document_row_from_text(text, "sanitized.pdf")

    # Then: the row gets a calendar-safe first-day fallback, but remains honest.
    assert row["date"] == "2025-02-01"
    assert "needs" + "_review" not in row
    assert "날짜 확인" in row["extract_status"]
    assert "월 단위" in row["extract_status"]
    assert "월 단위" in row["extraction_evidence"]


def test_extract_document_row_uses_korean_context_month_as_reviewed_fallback():
    # Given: sanitized context text where only the month is present.
    text = """
    기안일 2025년 2월
    시행 부서-5678 ( )
    제목 2025학년도 참고자료 정리
    담당자 테스트
    """

    # When: the parser reads the row from extracted text.
    row = extract_document_row_from_text(text, "sanitized-context.pdf")

    # Then: the month-only context date is usable and explicitly review-marked.
    assert row["date"] == "2025-02-01"
    assert "needs" + "_review" not in row
    assert "날짜 확인" in row["extract_status"]
    assert "월 단위" in row["extract_status"]
    assert "월 단위" in row["date_candidates"]


def test_extract_document_row_prefers_exact_context_day_over_month_only_approval():
    # Given: sanitized text with both an exact context date and a month-only approval date.
    text = """
    결재 대결 2025. 2.
    시행 부서-9012 (2025. 2. 14.)
    제목 2025학년도 업무 실행판 정비
    담당자 테스트
    """

    # When: the parser extracts the row.
    row = extract_document_row_from_text(text, "sanitized-exact.pdf")

    # Then: the exact day stays the source date and does not trigger date precision review.
    assert row["date"] == "2025-02-14"
    assert "needs" + "_review" not in row
    assert "날짜 확인" not in row["extract_status"]


def test_extract_document_row_reconstructs_split_title_from_pdf_lines():
    # Given: some school PDFs split a long document title around a standalone 제목 line.
    text = """
    실력다짐 샘플교육
    샘플초등학교
    수신 내부결재
    (경유)
    2025. 연구학교 유공교원 승진가산점 대상자 협의회 결과 보
    제목
    고
    1. 관련: 샘플부서-0000(2025.11.3.)
    ★연구기획부 2025. 11. 6.
    교감 홍길동 교장
    """

    row = extract_document_row_from_text(text, "sanitized-split-title.pdf")

    assert row["title"] == "2025. 연구학교 유공교원 승진가산점 대상자 협의회 결과 보고"
    assert row["date"] == "2025-11-06"


def test_extract_document_row_does_not_use_body_event_date_as_upload_date():
    # Given: the body has an event date, but no approval/final-document date exists.
    text = """
    수신 내부결재
    제목 2025학년도 행사용 물품 구입
    1. 행사일: 2025. 5. 20.(화)
    2. 구입하고자 합니다.
    """

    row = extract_document_row_from_text(text, "sanitized-no-approval-date.pdf")

    assert row["date"] == ""
    assert "needs" + "_review" not in row
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_does_not_use_body_implementation_date_as_source_date():
    # Given: the body says an activity will be implemented on a date, but the approval line is absent.
    text = """
    수신 내부결재
    제목 2027학년도 다문화교육 시행 계획 안내
    1. 다음 교육 시행 계획에 따라 연수를 2027. 5. 20. 진행합니다.
    2. 세부 내용은 붙임과 같습니다.
    """

    row = extract_document_row_from_text(text, "sanitized-body-implementation-date.pdf")

    assert row["title"] == "2027학년도 다문화교육 시행 계획 안내"
    assert row["date"] == ""
    assert "needs" + "_review" not in row
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_does_not_use_body_implementation_schedule_date_as_source_date():
    text = """
    수신 내부결재
    제목 2027학년도 다문화교육 운영 계획
    1. 시행일정: 2027. 5. 20.(목)
    2. 교육 운영 계획을 안내합니다.
    """

    row = extract_document_row_from_text(text, "sanitized-schedule-date.pdf")

    assert row["date"] == ""
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_does_not_use_numbered_body_implementation_day_as_source_date():
    text = """
    수신 내부결재
    제목 2027학년도 다문화교육 운영 계획
    1. 시행일: 2027. 5. 20.(목)
    2. 교육 운영 계획을 안내합니다.
    """

    row = extract_document_row_from_text(text, "sanitized-body-implementation-day.pdf")

    assert row["date"] == ""
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_accepts_line_start_implementation_day_metadata_without_colon():
    text = """
    수신 내부결재
    제목 2027학년도 다문화교육 운영 계획
    시행일 2027. 5. 21.
    """

    row = extract_document_row_from_text(text, "sanitized-source-implementation-day.pdf")

    assert row["date"] == "2027-05-21"
    assert "날짜 확인" not in row["extract_status"]


def test_extract_document_row_does_not_treat_body_approval_words_as_approval_line():
    text = """
    수신 내부결재
    제목 2027학년도 물품 구입 계획
    1. 학교장 전결 처리 예정일은 2027. 6. 3.입니다.
    2. 세부 내역은 붙임과 같습니다.
    """

    row = extract_document_row_from_text(text, "sanitized-body-approval-word.pdf")

    assert row["date"] == ""
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_prefers_actual_approval_date_over_related_date_on_approval_line():
    text = """
    수신 내부결재
    제목 2027학년도 결과 보고
    ★연구부 관련: 샘플부서-0000(2027. 6. 1.) 상신 2027. 6. 5.
    교감 홍길동 교장
    """

    row = extract_document_row_from_text(text, "sanitized-approval-related-date.pdf")

    assert row["date"] == "2027-06-05"


def test_extract_document_row_ignores_single_related_date_on_approval_line_without_submission_date():
    text = """
    수신 내부결재
    제목 2027학년도 결과 보고
    ★연구부 관련: 샘플부서-0000(2027. 6. 1.)
    교감 홍길동 교장
    """

    row = extract_document_row_from_text(text, "sanitized-related-only-approval-line.pdf")

    assert row["date"] == ""
    assert "needs" + "_review" not in row
    assert "날짜 확인" in row["extract_status"]


def test_extract_document_row_prefers_three_syllable_drafter_on_star_approval_line():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    ★교사 홍길동 교감 김관리 교장 이책임
    시행 샘플부-1234 (2027. 6. 5.)
    """

    row = extract_document_row_from_text(text, "sanitized-star-drafter.pdf")

    assert row["owner"] == "홍길동"


def test_extract_document_row_does_not_pick_school_or_department_as_owner_from_body_lines():
    text = """
    수신 내부결재
    제목 2027학년도 연구학교 운영 계획
    본문에는 다문화교육연구학교장 협조 문구가 먼저 나옵니다.
    ★연구기획부 2027. 6. 5.
    홍길동 교감 김관리 교장
    """

    row = extract_document_row_from_text(text, "sanitized-department-star.pdf")

    assert row["owner"] == "홍길동"


def test_extract_document_row_reconstructs_approval_day_split_after_month_line():
    text = """
    수신 내부결재
    제목 2027학년도 연구학교 운영 결과 보고
    대결 2027. 6.
    ★연구기획부
    홍길동 교감 24.
    시행 샘플부-1234 (2027. 6. 30.)
    """

    row = extract_document_row_from_text(text, "sanitized-split-approval-date.pdf")

    assert row["date"] == "2027-06-24"
    assert "월 단위" not in row["extract_status"]


def test_extract_document_row_reads_owner_from_date_then_role_block_without_star():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    붙임 운영 계획 1부. 끝.
    2027. 6. 5.
    교사 홍길동 교감 김관리 교장
    이책임
    시행 샘플부-1234 ( )
    """

    row = extract_document_row_from_text(text, "sanitized-no-star-role-block.pdf")

    assert row["date"] == "2027-06-05"
    assert row["owner"] == "홍길동"


def test_extract_document_row_accepts_department_head_approval_line_after_date():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    붙임 운영 계획 1부. 끝.
    2027. 6. 5.
    교육과정부장 홍길동 교감 김관리 교장
    이책임
    시행 샘플부-1234 ( )
    """

    row = extract_document_row_from_text(text, "sanitized-department-head-approval.pdf")

    assert row["date"] == "2027-06-05"
    assert row["owner"] == "홍길동"


def test_extract_document_row_accepts_attached_department_head_name_without_organization_fragment():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    붙임 운영 계획 1부. 끝.
    대결 2027. 6.
    교육과정부장홍길동 교감 19.
    김관리
    시행 샘플부-1234 ( )
    """

    row = extract_document_row_from_text(text, "sanitized-attached-department-head.pdf")

    assert row["date"] == "2027-06-19"
    assert row["owner"] == "홍길동"


def test_extract_document_row_does_not_promote_three_syllable_department_to_owner():
    text = """
    수신 내부결재
    제목 2027학년도 업무 운영 계획
    붙임 운영 계획 1부. 끝.
    ★연구부 교감 김관리 교장 이책임 2027. 6. 19.
    시행 샘플부-1234 ( )
    """

    row = extract_document_row_from_text(text, "sanitized-department-not-owner.pdf")

    assert row["owner"] != "연구부"

def test_body_sihaeng_iljeong_line_is_not_a_context_date():
    # 표에서 추출된 "시행일정" 셀은 줄 머리에 오지만 문서 시행일이 아니다.
    assert extract_context_date_candidates("시행일정 2025. 9. 1. ~ 2025. 9. 5.") == []


def test_extract_document_row_does_not_let_body_sihaeng_iljeong_beat_month_only_approval_date():
    text = """
    제목 2025학년도 학교스포츠클럽 운영 계획 보고
    시행일정 2025. 9. 1. ~ 2025. 9. 5.
    ★교무기획부
    대결 2025. 3.
    """

    row = extract_document_row_from_text(text, "sanitized-sihaeng-iljeong.pdf")

    assert row["date"] == "2025-03-01"
    assert "2025-09-01" not in row["date_candidates"]
    assert "월 단위" in row["extract_status"]


def test_extract_context_date_candidates_keeps_sihaeng_il_metadata_forms():
    assert [candidate.value for candidate in extract_context_date_candidates("시행일자: 2025. 3. 14.")] == ["2025-03-14"]
    assert [candidate.value for candidate in extract_context_date_candidates("시행일 2025. 3. 14.")] == ["2025-03-14"]


def test_extract_department_ignores_body_buseo_and_cheorigwa_suffixes_before_doc_number():
    for prose in (
        "각 부서별 협조 사항을 확인해 주시기 바랍니다.",
        "민원 처리과정 안내 문구를 확인해 주시기 바랍니다.",
    ):
        text = f"""
        수신 내부결재
        제목 2025학년도 협조 사항 안내
        {prose}
        시행 교무기획부-1234 (2025. 3. 14.)
        """

        row = extract_document_row_from_text(text, "sanitized-department-guard.pdf")

        assert row["department"] == "교무기획부"


def test_batch_isolates_a_failing_file(monkeypatch):
    from io import BytesIO
    from hermes_insu import pdf_extract

    calls = {"n": 0}
    real = pdf_extract.extract_document_row_from_bytes

    def flaky(data, file_name, document_type="draft"):
        calls["n"] += 1
        if "bad" in file_name:
            raise RuntimeError("boom")
        return real(data, file_name, document_type=document_type)

    monkeypatch.setattr(pdf_extract, "extract_document_row_from_bytes", flaky)

    files = [
        _named_stream(b"%PDF-1.4 good", "good1.pdf"),
        _named_stream(b"%PDF-1.4 bad", "bad.pdf"),
        _named_stream(b"%PDF-1.4 good", "good2.pdf"),
    ]
    rows = pdf_extract.convert_uploaded_pdfs_to_document_rows(files)
    assert len(rows) == 3
    statuses = {r["file_name"]: r["extract_status"] for r in rows}
    assert "추출 실패" in statuses["bad.pdf"]
    # 정상 파일 2건은 실패로 오염되지 않는다.
    assert "추출 실패" not in statuses["good1.pdf"]
    assert "추출 실패" not in statuses["good2.pdf"]


def _named_stream(data: bytes, name: str):
    from io import BytesIO
    stream = BytesIO(data)
    stream.filename = name
    return stream
