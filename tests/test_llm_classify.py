import json

import pytest

from app import create_app
from hermes_insu import llm_classify
from hermes_insu.llm_classify import (
    LlmClassifyError,
    LlmUnavailableError,
    classify_titles,
)


class FakeBlock:
    type = "text"

    def __init__(self, text):
        self.text = text


class FakeResponse:
    stop_reason = "end_turn"

    def __init__(self, payload):
        self.content = [FakeBlock(json.dumps(payload))]


class FakeMessages:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.payload)


class FakeClient:
    def __init__(self, payload):
        self.messages = FakeMessages(payload)


def test_classify_titles_parses_structured_results():
    payload = {
        "results": [
            {"index": 0, "job": "계기교육", "group": "통일", "stage": "계획"},
            {"index": 1, "job": "계기교육", "group": "통일", "stage": "결과보고"},
        ]
    }
    client = FakeClient(payload)
    results = classify_titles(["통일교육주간 운영 계획", "통일교육주간 결과보고"], client=client)

    assert results == payload["results"]
    request = client.messages.calls[0]
    assert request["model"] == llm_classify.MODEL
    assert "통일교육주간 운영 계획" in request["messages"][0]["content"]
    assert request["output_config"]["format"]["type"] == "json_schema"


def test_classify_titles_drops_invalid_indexes_and_stages():
    payload = {
        "results": [
            {"index": 99, "job": "x", "group": "y", "stage": "계획"},
            {"index": 0, "job": "안전교육", "group": "소방", "stage": "예산검토"},
        ]
    }
    results = classify_titles(["소방 대피 훈련"], client=FakeClient(payload))
    assert results == [{"index": 0, "job": "안전교육", "group": "소방", "stage": None}]


def test_classify_titles_raises_when_response_is_not_json():
    class BrokenClient:
        class messages:
            @staticmethod
            def create(**kwargs):
                return type("R", (), {"stop_reason": "end_turn", "content": [FakeBlock("not-json")]})()

    with pytest.raises(LlmClassifyError):
        classify_titles(["제목"], client=BrokenClient())


def test_classify_titles_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises((LlmUnavailableError, LlmClassifyError)):
        classify_titles(["제목"])  # anthropic 미설치 또는 키 없음 → 폴백 신호


def test_api_classify_llm_returns_503_when_unavailable(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    app = create_app()
    client = app.test_client()
    response = client.post("/api/classify-llm", json={"titles": ["통일교육주간 운영 계획"]})
    assert response.status_code == 503
    assert response.get_json()["error"] == "llm_unavailable"


def test_api_classify_llm_success(monkeypatch):
    def fake_classify(titles, client=None):
        return [{"index": 0, "job": "계기교육", "group": "통일", "stage": "계획"}]

    monkeypatch.setattr(llm_classify, "classify_titles", fake_classify)
    app = create_app()
    client = app.test_client()
    response = client.post("/api/classify-llm", json={"titles": ["통일교육주간 운영 계획"]})
    assert response.status_code == 200
    body = response.get_json()
    assert body["contractVersion"] == "classify-llm.v1"
    assert body["results"][0]["group"] == "통일"


def test_api_classify_llm_validates_payload():
    app = create_app()
    client = app.test_client()
    assert client.post("/api/classify-llm", json={"titles": "x"}).status_code == 400
    assert client.post("/api/classify-llm", json=["x"]).status_code == 400


def test_classify_titles_truncates_overlong_titles():
    from hermes_insu.llm_classify import MAX_TITLE_LEN

    captured = {}

    class CapturingMessages:
        def create(self, **kwargs):
            captured["content"] = kwargs["messages"][0]["content"]
            return FakeResponse({"results": []})

    class CapturingClient:
        messages = CapturingMessages()

    long_title = "가" * (MAX_TITLE_LEN + 500)
    classify_titles([long_title], client=CapturingClient())
    # The prompt must not contain a title longer than the cap.
    assert ("가" * (MAX_TITLE_LEN + 1)) not in captured["content"]
