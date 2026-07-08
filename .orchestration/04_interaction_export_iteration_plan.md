# Iteration 4 — card interaction and export expansion

## Goal
Make the cockpit more usable for local pilot demos without building Windows yet.

## Scope
- Card selection UX: clicking operation/workflow cards updates the work-card detail panel.
- Detail panel should show selected card title/date/doc/owner/reference/stage and selection state.
- Export basics expansion: add deterministic CSV export API/payload for operation cards and review-needed list.
- Frontend export panel should offer Markdown and CSV copy/download without server-side storage.
- Empty-state: if no cards, workflow/export panels should remain honest and not crash.

## Guardrails
- No push/GitHub Actions/Windows build.
- No raw PDF storage.
- No automatic collection/watch folder.
- No OCR/Tesseract end-user guidance.
- No fabricated pilot metrics.
- Handover remains optional post-it/reference memo only.

## Verification
- Python tests.
- Frontend tests.
- Frontend build.
- compileall.
- git diff --check.
- Independent spec and quality review before commit.
