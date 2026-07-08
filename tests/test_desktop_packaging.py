from pathlib import Path

import build_exe
import run_local
from app import create_app


def test_react_desktop_mode_serves_built_frontend(tmp_path):
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<div id='root'>React cockpit</div>", encoding="utf-8")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('ok')", encoding="utf-8")

    app = create_app(frontend_dist=dist, prefer_react=True)
    client = app.test_client()

    home = client.get("/")
    asset = client.get("/assets/app.js")

    assert home.status_code == 200
    assert "React cockpit" in home.get_data(as_text=True)
    assert asset.status_code == 200
    assert "console.log" in asset.get_data(as_text=True)


def test_pyinstaller_args_include_launcher_and_react_assets():
    args = build_exe.build_pyinstaller_args(project_root=Path("/project"))
    joined = "\n".join(str(arg) for arg in args)

    assert "/project/run_local.py" in joined
    assert "--name" in args
    assert "모두의인수인계" in args
    assert "frontend/dist" in joined
    assert "templates" in joined


def test_build_summary_lines_are_ascii_for_windows_ci_console():
    lines = build_exe.distribution_summary_lines()

    assert lines
    assert all(line.isascii() for line in lines)


def test_windows_distribution_docs_are_end_user_only(tmp_path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    (project_root / "README.md").write_text(
        "개발자는 python -m pip install 후 npm run dev를 실행합니다.",
        encoding="utf-8",
    )
    dist_dir = tmp_path / "dist" / build_exe.APP_NAME

    build_exe.copy_user_docs(project_root, dist_dir)

    assert not (dist_dir / "README.md").exists()
    instructions = (dist_dir / "사용방법.txt").read_text(encoding="utf-8")
    assert "모두의인수인계.exe를 더블클릭" in instructions
    assert "압축 풀기" in instructions
    assert "PDF 업로드" in instructions
    assert "추출 결과 확인" in instructions
    assert "업무목록" in instructions
    assert "백업" in instructions
    assert "업무묶음 DOCX" in instructions
    assert "업무묶음 Markdown" in instructions
    assert "python" not in instructions.lower()
    assert "npm" not in instructions.lower()
    assert "pip" not in instructions.lower()


def test_local_launcher_messages_are_end_user_friendly():
    lines = run_local.startup_message_lines("http://127.0.0.1:5010/")
    text = "\n".join(lines)

    assert "브라우저가 열리지 않으면" in text
    assert "PDF 업로드" in text
    assert "업무카드 확인" in text
    assert "백업" in text
    assert "후임자 참고자료" in text
    assert "python" not in text.lower()
    assert "traceback" not in text.lower()


def test_free_port_error_message_is_user_friendly(monkeypatch):
    class BusySocket:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def settimeout(self, _timeout):
            return None

        def connect_ex(self, _address):
            return 0

    monkeypatch.setattr(run_local.socket, "socket", lambda *_args, **_kwargs: BusySocket())

    try:
        run_local.find_free_port()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("find_free_port should fail when every local port is busy")

    assert "앱을 열 포트를 찾지 못했습니다" in message
    assert "5001" in message
