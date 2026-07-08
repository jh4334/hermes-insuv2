from __future__ import annotations

import subprocess
import sys
from pathlib import Path

APP_NAME = "모두의인수인계"


def add_data_arg(source: Path, target: str) -> str:
    separator = ";" if sys.platform.startswith("win") else ":"
    return f"{source}{separator}{target}"


def build_pyinstaller_args(project_root: Path | None = None) -> list[str]:
    root = (project_root or Path(__file__).resolve().parent).resolve()
    return [
        "pyinstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        APP_NAME,
        "--add-data",
        add_data_arg(root / "templates", "templates"),
        "--add-data",
        add_data_arg(root / "frontend" / "dist", "frontend/dist"),
        str(root / "run_local.py"),
    ]


def distribution_summary_lines() -> list[str]:
    return [
        "=" * 60,
        "Windows distribution folder created",
        "  dist/<app-folder>/<exe-file>",
        "Zip the folder and share it with end users.",
        "End users only need to unzip and double-click the EXE file.",
        "=" * 60,
    ]


def copy_user_docs(project_root: Path, dist_dir: Path) -> None:
    """Write only end-user Windows instructions into the distribution folder."""
    dist_dir.mkdir(parents=True, exist_ok=True)
    (dist_dir / "사용방법.txt").write_text(
        "1. 압축 풀기\n"
        "2. 모두의인수인계.exe를 더블클릭\n"
        "3. 브라우저가 열리면 PDF 업로드 후 추출 결과 확인\n"
        "4. 캘린더와 업무목록에서 날짜·문서번호·담당을 교사가 직접 점검\n"
        "5. 내보내기에서 로컬 백업 저장, 업무묶음 DOCX 생성, 업무묶음 Markdown 저장\n"
        "6. HWPX는 추후 지원 예정\n\n"
        "원본 PDF는 앱 DB/영구 저장소에 저장하지 않고, 문서번호 + 기안일 + 참고자료 위치 중심으로 정리합니다.\n",
        encoding="utf-8",
    )


def main() -> None:
    project_root = Path(__file__).resolve().parent
    args = build_pyinstaller_args(project_root)
    subprocess.run(args, cwd=project_root, check=True)
    copy_user_docs(project_root, project_root / "dist" / APP_NAME)
    for line in distribution_summary_lines():
        print(line)


if __name__ == "__main__":
    main()
