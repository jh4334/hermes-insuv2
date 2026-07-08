# Iteration 5 — Two-mode entry structure

## Goal
Introduce two clear product modes without splitting the underlying data model.

1. 후임자 참고 메모 모드
   - 전임자가 후임자에게 업무 카드별 주의사항, 참고자료 위치, 포스트잇 메모를 남기는 흐름.
   - Avoid making it feel like mandatory handover-document writing.

2. 셀프 업무복원 모드
   - 올해 담당자가 전년도 공문 메타데이터를 바탕으로 업무 흐름과 실행 계획을 직접 복원하는 흐름.
   - Keep extraction candidate table, review queue, workflow, and export central.

## Guardrails
- One shared operation-card data model.
- No raw PDF storage.
- No automatic official-document collection.
- No fabricated pilot metrics.
- No GitHub auth/push/Windows build in this iteration.
- Claude review must use Opus and be read-only.

## Intended implementation
- Add mode selection hero/cards in React UI.
- Add `mode` state: `selfRecovery` and `handoverMemo`.
- Change copy, panel emphasis, and visible guidance by mode.
- Keep shared data, board, selected card, workflow, and export behavior.
- Add frontend tests for both mode entries and mode-specific copy.
- Add documentation/log entry.

## Verification
- Python tests
- compileall
- frontend tests
- frontend build
- git diff --check
- independent review
