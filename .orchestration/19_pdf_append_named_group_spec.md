# 19. PDF append + named group iteration

User requirements:
1. Remove the 20 PDF count limit. Keep request-size/privacy validation.
2. Remove fixed 업무묶음 keyword/category workflow. When PDF candidates are extracted, the teacher directly enters a group/work name such as `교육과정` or `계기교육` before adding to the board.
3. Tasks added in one PDF batch share a randomly selected visible color.
4. PDF extraction should append to the existing board, not replace it. Each newly added PDF batch gets a color different from existing displayed batch colors when possible.
5. Backend stage inference should only use `계획`, `품의`, `보고`, `예산`. Remove extra workflow-stage/category buttons from the UI.

Guardrails:
- Local-first. No raw PDF storage.
- Keep calendar-first IA: 캘린더 / 업무목록 / 내보내기.
- Use TDD and full verification before commit.
- Do not push or build exe unless separately requested after this iteration.
