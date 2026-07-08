from __future__ import annotations

import os
import socket
import threading
import time
import webbrowser
from pathlib import Path

from app import create_app


APP_NAME = "모두의인수인계"
DEFAULT_PORT = 5001


def find_free_port(preferred: int = DEFAULT_PORT) -> int:
    for port in [preferred, *range(5010, 5030)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("앱을 열 포트를 찾지 못했습니다. 기존 모두의인수인계 창을 닫고 다시 실행하세요. 확인 범위: 5001, 5010-5029")


def open_browser_later(url: str, delay: float = 1.0) -> None:
    def _open() -> None:
        time.sleep(delay)
        webbrowser.open(url)

    threading.Thread(target=_open, daemon=True).start()


def startup_message_lines(url: str) -> list[str]:
    return [
        f"{APP_NAME} 로컬 실행: {url}",
        "브라우저가 열리지 않으면 위 주소를 복사해 주소창에 붙여넣으세요.",
        "흐름: PDF 업로드 → 업무카드 확인 → 로컬 백업 저장 → 후임자 참고자료 생성",
    ]


def main() -> None:
    project_root = Path(__file__).resolve().parent
    frontend_dist = project_root / "frontend" / "dist"
    port = int(os.environ.get("HERMES_INSU_PORT") or find_free_port())
    url = f"http://127.0.0.1:{port}/"
    app = create_app(frontend_dist=frontend_dist, prefer_react=True)
    open_browser_later(url)
    for line in startup_message_lines(url):
        print(line, flush=True)
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
