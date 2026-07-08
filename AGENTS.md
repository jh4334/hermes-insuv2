# AGENTS.md

## Product stance

Hermes Insu is not a handover-document writing app. It is a local-first operations-board generator that turns previous-year school documents into current-year work plans.

## Hard constraints

- Do not reintroduce contest pilot metric cards as product UI.
- Do not add automatic 공문 collection/watch-folder features.
- Do not require final users to install Python, pip, terminal tools, OCR, or Tesseract.
- Do not store raw PDFs as the handover source of truth in the first product line.
- Do not commit real school/private documents, credentials, tokens, or personal data.

## Preferred wording

Use:
- 공문 기반 업무 흐름
- 올해 업무 실행판
- 후임자 참고 메모
- 포스트잇형 참고 메모
- 참고자료 위치
- 문서번호 + 기안일

Avoid making the main product sound like mandatory handover writing.

## Done criteria

- Tests pass.
- Compile check passes.
- `git diff --check` passes.
- README/docs match the current concept.
- UI keeps handover as optional memo, not the core burden.
