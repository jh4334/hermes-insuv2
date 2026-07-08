from pathlib import Path

import build_exe


REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_readme_uses_current_modoo_insu_calendar_first_branding():
    text = read_text("README.md")

    assert text.startswith("# 모두의 인수인계")
    assert "공문 기반 캘린더" in text
    assert "로컬-first" in text
    assert "압축 풀기" in text
    assert "모두의인수인계.exe" in text
    assert "업무묶음 DOCX" in text
    assert "업무묶음 Markdown" in text
    assert "codex-insu" not in text
    assert "기존 HTML MVP" not in text
    assert "자동 생성" not in text
    assert "키워드 기반 제안" not in text
    assert "공문 자동수집" not in text


def test_product_brief_matches_local_first_teacher_confirmation_positioning():
    text = read_text("docs/product_brief.md")

    assert text.startswith("# 모두의 인수인계 Product Brief")
    assert "공문 기반 캘린더 앱" in text
    assert "교사가 직접 점검" in text
    assert "후임자 참고 메모" in text
    assert "업무묶음 DOCX" in text
    assert "원본 PDF" in text
    assert "자동 생성" not in text
    assert "공문 자동수집" not in text
    assert "별도 인수인계 문서 작성을 강요" in text


def test_fallback_template_does_not_surface_removed_gantt_or_old_workflow_copy():
    text = read_text("templates/index.html")

    assert "모두의 인수인계" in text
    assert "캘린더" in text
    assert "업무목록" in text
    assert "내보내기" in text
    assert "업무묶음 DOCX" in text
    assert "간트" not in text
    assert "메타데이터 붙여넣기" not in text
    assert "자동 생성" not in text


def test_windows_user_docs_describe_current_export_outputs(tmp_path):
    dist_dir = tmp_path / "dist" / build_exe.APP_NAME

    build_exe.copy_user_docs(tmp_path, dist_dir)

    instructions = (dist_dir / "사용방법.txt").read_text(encoding="utf-8")
    assert "업무묶음 DOCX" in instructions
    assert "업무묶음 Markdown" in instructions
    assert "HWPX는 추후 지원" in instructions
    assert "후임자 참고자료" not in instructions
    assert "python" not in instructions.lower()
    assert "npm" not in instructions.lower()
    assert "pip" not in instructions.lower()
