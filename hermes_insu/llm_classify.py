"""온라인 LLM 분류 (기획 문서 §4·§8).

명시적으로 동의한 사용자의 요청에 한해 공문 '제목만' Claude에 보내
업무/세부업무/단계 후보를 받아온다. 원문·첨부·개인정보는 전송하지 않는다.
anthropic 패키지나 API 키가 없으면 LlmUnavailableError를 던져
앱이 오프라인 규칙 분류로 폴백하게 한다.
"""

from __future__ import annotations

import json
import os

MODEL = "claude-opus-4-8"
MAX_TITLES = 200
MAX_TITLE_LEN = 300  # 공문 제목 한 건의 최대 길이 — 남용/초대형 페이로드 방지
STAGES = ["계획", "심의·협의", "품의", "결과보고"]

RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "job": {"type": "string"},
                    "group": {"type": "string"},
                    "stage": {"type": "string", "enum": STAGES},
                },
                "required": ["index", "job", "group", "stage"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["results"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "당신은 한국 학교 행정 공문(기안문) 제목을 분류하는 도우미입니다. "
    "각 제목에 대해 업무(job, 예: 계기교육·안전교육·교육과정), "
    "세부업무(group, 예: 통일·독도·소방훈련), "
    "단계(stage: 계획/심의·협의/품의/결과보고 중 하나)를 제안하세요. "
    "위원회·심의회 개최 관련 문서는 심의·협의 단계입니다. "
    "같은 흐름의 제목에는 같은 job/group 이름을 쓰세요. 이름은 짧은 한국어 명사구로 답하세요."
)


class LlmUnavailableError(RuntimeError):
    """anthropic 패키지 또는 API 키가 없어 온라인 분류를 쓸 수 없음."""


class LlmClassifyError(RuntimeError):
    """LLM 호출은 됐지만 사용할 수 있는 분류 결과를 받지 못함."""


def _default_client():
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - 환경에 따라 다름
        raise LlmUnavailableError(
            "anthropic 패키지가 설치되어 있지 않습니다. 온라인 분류를 쓰려면 'pip install anthropic' 후 ANTHROPIC_API_KEY를 설정하세요."
        ) from exc
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise LlmUnavailableError("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.")
    return anthropic.Anthropic()


def classify_titles(titles: list[str], client=None) -> list[dict]:
    """제목 목록을 분류해 [{index, job, group, stage}, ...]를 돌려준다."""
    # 위치가 곧 카드 인덱스이므로 빈 제목도 자리(순서)는 유지한다.
    # 초대형 제목은 잘라 남용/토큰 폭증을 막는다(원문이 아니라 제목이므로 손실 미미).
    cleaned = [str(title).strip()[:MAX_TITLE_LEN] for title in titles]
    if not any(cleaned):
        return []
    if len(cleaned) > MAX_TITLES:
        raise LlmClassifyError(f"제목은 한 번에 {MAX_TITLES}개까지만 분류할 수 있습니다.")

    if client is None:
        client = _default_client()

    numbered = "\n".join(f"{index}. {title}" for index, title in enumerate(cleaned))
    response = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": RESULT_SCHEMA}},
        messages=[{"role": "user", "content": f"다음 공문 제목들을 분류하세요:\n{numbered}"}],
    )

    if getattr(response, "stop_reason", None) == "refusal":
        raise LlmClassifyError("모델이 요청을 거절했습니다.")

    text_blocks = [block for block in response.content if getattr(block, "type", None) == "text"]
    if not text_blocks:
        raise LlmClassifyError("모델 응답에 텍스트가 없습니다.")
    try:
        payload = json.loads(text_blocks[0].text)
    except (ValueError, TypeError) as exc:
        raise LlmClassifyError("모델 응답을 JSON으로 해석하지 못했습니다.") from exc

    results = []
    for item in payload.get("results", []):
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        if not isinstance(index, int) or index < 0 or index >= len(cleaned):
            continue
        stage = item.get("stage")
        results.append(
            {
                "index": index,
                "job": str(item.get("job") or "").strip(),
                "group": str(item.get("group") or "").strip(),
                "stage": stage if stage in STAGES else None,
            }
        )
    return results
