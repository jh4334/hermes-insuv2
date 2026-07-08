# Iteration Log

## 0. Repository reset

- Created `hermes-insu` as a fresh private repository so `codex-insu` can remain a runnable stable line.
- Product reset: document-based operations board first; handover as optional post-it memo only.
- Initial MVP intentionally uses pasted metadata lines before rebuilding the PDF pipeline.

## Iteration 1 — React/Vite operations cockpit pivot
- Claude design: used `claude --model opus` as requested. Initial long `--max-turns 1` prompt failed; concise Opus prompt with `--max-turns 3` succeeded.
- Design direction: React/Vite + TypeScript frontend, Python/Flask backend/domain retained, Linear/Framer-like dark product cockpit rather than public-institution style.
- Implemented: JSON API contract (`/api/health`, `/api/analyze`, `/api/board`), extraction candidate review table, operations board shell/cards, parse-error panel, malformed request validation.
- Guardrails maintained: no raw PDF DB storage, no automatic document collection/watch folder, no OCR/Tesseract end-user guidance, no fake pilot metrics; handover remains optional memo framing.
- Reviews: spec review PASS; quality review found malformed JSON/parse error blockers; fixes applied; final blocker-only review APPROVED.
- Verification: `python3 -m pytest -q` 14 passed; `compileall` passed; frontend `npm test -- --run` 4 passed; `npm run build` passed; `git diff --check` passed.

## Iteration 2 — Review queue, detail panel, and Windows packaging prep
- Implemented deterministic review queue for extraction errors, missing owner/doc number/reference location hints, and dense work months.
- Implemented React risk review queue and work-card detail panel while keeping handover as optional post-it/reference memo.
- Added desktop launcher and Windows PyInstaller packaging workflow for a non-technical Windows zip distribution.
- Added React dist serving mode for the desktop app; existing Flask HTML MVP remains available for tests/legacy route.
- Verification: `python3 -m pytest -q` 18 passed; `compileall` passed; frontend `npm test -- --run` 5 passed; `npm run build` passed; `git diff --check` passed.


## Iteration 3 — workflow visualization and export basics

- Stopped the pending GitHub workflow auth/build path per user request and continued product development.
- Added deterministic month/week workflow calendar generation from operation cards.
- Added `/api/analyze.workflow` payload and `/api/export` Markdown attachment endpoint.
- Added React cockpit sections for monthly/weekly workflow visualization and browser-only Markdown export copy/download.
- Export includes operations plan + review-needed list with placeholders only; no fabricated pilot results or raw PDF storage.
- Verification: `python3 -m pytest -q` => 23 passed; compileall => passed; `npm test -- --run` => 6 passed; `npm run build` => passed; `git diff --check` => passed.
- Independent reviews: spec compliance PASS; code quality APPROVED.

## Iteration 4 — card selection, CSV export, empty states

- Continued after interrupted subagent left failing TDD tests for CSV export.
- Added deterministic CSV export in domain and `/api/export` format support for `markdown` and `csv`.
- Added React card selection so operation/workflow cards update the work-card detail panel.
- Detail panel now shows selected title/date/doc/owner/reference/stage/reference location.
- Added empty states for no cards, no month load, no workflow, and CSV empty placeholder rows.
- Guardrails kept: no raw PDF storage, no automatic collection, no fabricated pilot metrics, no push/build/auth.
- Verification: `python3 -m pytest -q` = 26 passed; `compileall` passed; frontend `npm test -- --run` = 8 passed; `npm run build` passed; `git diff --check` passed.
- Independent review: initial spec review flagged missing owner/reference in detail panel; fixed and re-verified. Code-quality review PASS.


## Iteration 5 — two-mode entry and palette-specific views

- Claude PM/UX review: first Opus prompt failed with `Reached max turns (3)`; retried with a short read-only `claude --model opus` prompt and used the successful guidance: one shared data model, mode-specific copy/visibility layer, avoid sensitive memo leakage, avoid making handover mandatory.
- Implemented two entry modes in the React cockpit: `셀프 업무복원 모드` as the default and `후임자 참고 메모 모드` as a switchable view.
- Kept the same board/candidate/review/export data visible across modes; only entry copy, guidance, status, and theme change by audience.
- Applied mode-specific design palettes:
  - Self recovery: Cream Vanilla `#efe6dd` + Cherry Cola `#9a0002`.
  - Predecessor memo: Butter `#ffefb3` + Green `#013e37`.
- Fixed independent review accessibility blocker: selected Butter/Green mode-card descriptions now use a dedicated `mode-card-description` class with butter-toned text on deep green.
- Guardrails kept: no raw PDF storage, no automatic document collection/watch folder, no fabricated pilot metrics, no mandatory handover-document wording, no push/build/auth.
- Verification: `python3 -m pytest -q` = 26 passed; `compileall` passed; frontend `npm test -- --run` = 13 passed; `npm run build` passed; `git diff --check` passed.
- Independent reviews: spec compliance PASS; code-quality/accessibility review initially requested changes for selected Butter/Green contrast; fixed and re-review APPROVED.


## 2026-07-01 — Calendar-first simplification + Sonnet5 ultracode orchestration

- Reconfigured orchestration notes to use Claude Sonnet5 + Superpowers/ultracode for read-only review and Codex `codex exec` goal-style runs for code review/implementation.
- Simplified app IA to calendar-first: `캘린더 / 업무목록 / 내보내기`.
- Kept PDF upload and annual ICS export in calendar view; isolated local backup/import/successor handoff/CSV/reset in export view.
- Removed old Dashboard/Month/Gantt/Memos screen code and stale handlers.
- Verification: Python 36 passed; frontend 28 passed; frontend production build passed; browser smoke passed on 127.0.0.1:5192; git diff whitespace check passed.
- Reviews: Claude Sonnet5 ultracode PASS; Codex read-only found stale helpers/handlers, fixed; Codex re-review PASS.


## 2026-07-07 — Compact date-import hardening

- Ran a compact Fable5 planning gate after the user said `오케 다시`; chose a narrow calendar/date helper hardening slice rather than broad UI or build work.
- Added strict real `YYYY-MM-DD` validation for frontend date helpers so malformed imported/backup dates like `2026-99-99` or `2026-02-31` no longer enter calendar-year lookup/range checks or silently roll over during day arithmetic.
- Fixed an independent-review blocker where malformed `end_date` could still produce invalid ICS `DTEND`; ICS export now validates `end_date` and falls back to the valid start date.
- Verification: `python3 -m pytest -q` = 60 passed; `compileall` passed; frontend `npm test -- --run` = 102 passed with pre-existing React act warnings only; frontend `npm run build` passed; `git diff --check` passed.
- Reviews: independent read-only review initially REQUEST_CHANGES for invalid ICS `DTEND`, fixed with RED/GREEN regression; re-review PASS; Claude Fable5 final readiness review VERDICT: GO.


## 2026-07-07 — Annual calendar interaction QA + Plus/Minus empty defaults

- Responded to user QA request for annual-calendar drag/drop, hover-title preview, and Plus memo default behavior.
- Kept existing annual-calendar drag/drop behavior and added/verified coverage around large annual calendar drag/drop plus hover/focus preview showing the full document title, document number, and owner.
- Removed prefilled sample `successor_memo` values and now returns empty `bundlePmiMemos` for sample demo data so Plus/Minus memo areas start blank like real teacher input.
- Shortened Plus/Minus placeholder copy to `좋았던 점` / `아쉬웠던 점` in 업무목록 and task edit dialog.
- Verification: targeted RED tests failed for sample memo defaults and placeholder copy; after implementation, targeted tests passed. Full verification: `python3 -m pytest -q` = 60 passed; compileall passed; frontend `npm test -- --run` = 103 passed with pre-existing React act warnings only; frontend `npm run build` passed; `git diff --check` passed.
- Review: independent read-only blocker review PASS.

## 2026-07-07 — Task list alignment + PDF parser Fable fixes

- Centered the task-list `업무묶음`, `업무명`, and `관리` columns and changed task rows to middle vertical alignment while preserving date/owner nowrap behavior.
- Ran a Claude Fable5 parser review with source excerpts after the no-tools attempt could not inspect files; accepted the high-signal fixes.
- Fixed PDF date extraction so unnumbered/table-style `시행일정 ...` body schedule rows no longer match document metadata `시행일` or outrank approval dates.
- Fixed department extraction so body prose like `부서별` / `처리과정` no longer shadows the reliable `시행 부서-번호` department.
- Verification: Python `64 passed`; `compileall` passed; frontend `103 passed`; frontend `npm run build` passed; `git diff --check` passed. Independent read-only review PASS.

## 2026-07-07 — Archive layout and workflow-chip cleanup

- Raised annual-calendar hover previews above large-year grid cells with explicit hover/focus z-index and visible overflow so full titles are not hidden behind neighboring layout.
- Widened the task-list archive table and kept date/title/document number/owner cells on one line; removed per-document edit buttons so only bundle-level Plus/Minus memos are edited there.
- Tightened workflow-stage inference so generic 제출/현황/신청서 documents do not get a misleading 결과보고/계획 chip unless the title explicitly says 결과보고/결과 보고/보고서.
- Verification: Python tests 64 passed, compileall passed, frontend tests 103 passed, frontend build passed, git diff --check passed, independent review PASS.

## 2026-07-07 — Explicit Plus/Minus memo save UX

- Replaced blur-based 업무묶음 Plus/Minus auto-save with an explicit `저장` button so teachers can see when memo edits are pending and when they have been saved.
- Added helper copy (`작성 후 저장 버튼을 눌러야 반영됩니다`), a dirty badge (`저장 전 변경사항 있음`), and a saved badge (`저장 완료`) on each 업무묶음 memo card.
- Kept bundle-level persistence isolated from per-document legacy `successor_memo` values; edits are only written to bundle PMI storage after clicking 저장.
- Verification: targeted RED/GREEN test passed; Python tests 64 passed, compileall passed, frontend tests 103 passed, frontend build passed, git diff --check passed, independent review PASS.

## 2026-07-07 — DOCX 업무지형도 map export

- Fixed DOCX handoff export so page 1 contains a recognizable 업무지형도 map, not only a summary row.
- Added a 2x2 quadrant table with horizontal axis `시기 집중 ↔ 연중 지속`, vertical axis `공문 적음 ↕ 공문 많음`, all four quadrant labels, and current 업무묶음 placement with busiest-month summary.
- Kept monthly distribution and Plus/Minus pages unchanged and preserved privacy guardrails: no raw PDF text or reference-location content in DOCX.
- Verification: RED test failed before implementation; targeted test passed; Python tests 64 passed, compileall passed; frontend tests 103 passed; frontend build passed; git diff --check passed; independent review PASS.

## 2026-07-07 — DOCX 업무지형도 scatter-map fidelity

- Request: make DOCX export show the 업무지형도 itself, not a map plus summary-table-looking layout.
- TDD: strengthened `frontend/src/exportDocx.test.ts` to require a dedicated coordinate/scatter map, current marker text (`● 업무묶음`), busiest-month text in the matching quadrant, and absence of summary headers `업무 성격` / `가장 바쁜 때`.
- Implementation: updated `frontend/src/exportDocx.ts` so the DOCX page renders a standalone 좌표형 업무지형도 with Y-axis/X-axis labels, central cross line, four quadrant labels, and the selected bundle as a marker in the matching quadrant. Removed the separate quadrant summary table from the map area.
- Privacy: no raw PDF text, reference-location content, or memo prompts added to the map.
- Verification: target DOCX test passed; Python tests passed; compileall passed; frontend full tests passed; frontend build passed; `git diff --check` passed; independent review PASS.

## 2026-07-07 — DOCX 업무지형도 image export fallback

- Issue: Word/DOCX rendering could break the coordinate-style 업무지형도 because it depended on box-drawing characters and text alignment.
- Change: Replaced the primary DOCX 업무지형도 body with an embedded app-like SVG image and a generated PNG fallback for clients that do not render SVG.
- Guardrails: Kept raw PDF/reference text out of the export; only group name, quadrant labels, and busiest-month summary are placed in the image.
- Verification: exportDocx regression test, Python tests, compileall, frontend full tests, frontend build, diff check, and independent review passed.
## 2026-07-07 — DOCX unified quadrant handoff structure

- Issue: The image-based map fixed Word rendering, but the DOCX still repeated one isolated quadrant map per bundle, repeated privacy copy, and could leave empty-looking Plus/Minus pages.
- Change: Moved the DOCX to a compact structure with one front unified 업무지형도 containing all bundles, then per-bundle sections with 업무 성격 / 가장 바쁜 때, monthly distribution, and bundle-level Plus/Minus notes.
- Compression: Removed per-bundle map images and forced Plus/Minus page breaks, shows `Plus/Minus 메모 없음` for empty bundle notes, and limits monthly representative titles to two.
- Verification: RED/GREEN exportDocx regression test passed; Python tests 64 passed; compileall passed; frontend tests 103 passed; frontend build passed; diff check passed; independent review PASS.

## 2026-07-07 — DOCX final visual QA polish

- Issue: Final sample DOCX QA showed the unified map was structurally correct, but SVG marker labels could crowd quadrant titles and the PNG fallback needed readable numbered markers for all bundle counts.
- Change: Stacked SVG label callouts by quadrant, added soft title backgrounds, kept a visible `지도 번호:` legend after the map, and upgraded the real PNG fallback to draw full marker numbers including `0` and multi-digit labels instead of a last-digit-only marker.
- QA artifact: Generated `/tmp/hermes-insu-docx-final-qa/modoo-insu-sample-final.docx`, extracted the embedded map SVG, and rendered QuickLook preview `/tmp/hermes-insu-docx-final-qa/ql/modoo-insu-sample-final.docx.png`.
- Inspection: DOCX contains one SVG plus one PNG fallback, privacy note appears once, legend is present, no raw source markers are present, no stray square symbol exists in document XML, and the fallback code no longer contains `slice(-1)`.
- Verification: Python tests 64 passed; compileall passed; frontend tests 103 passed; frontend build passed; `git diff --check` passed; independent review PASS.

## 2026-07-07 — DOCX marker legend finalization

- Issue: External DOCX re-review found the unified map structure was fixed but map text labels still overlapped when markers were close, and sample data left the right-side/year-round quadrant underrepresented.
- Change: Removed group-name/busiest-month text from the SVG map entirely; the map now uses numbered colored markers only, with a real DOCX `지도 번호 범례` table below it for 번호 / 업무묶음 / 업무 성격·가장 바쁜 때.
- Cleanup: Removed duplicate axis labels, enlarged numbered SVG markers, switched clean page transitions to `pageBreakBefore`, and set fixed `DXA` table widths plus `columnWidths` for the legend and monthly distribution tables so QuickLook/Word do not collapse Korean text into vertical one-character columns.
- Sample data: Added a synthetic 10-month `학급운영` year-round sample bundle so the demo map fills the `연중 핵심 업무` side without using real school/person/document metadata.
- QA artifact: Regenerated `/tmp/hermes-insu-docx-final-qa/modoo-insu-sample-final.docx`, extracted `/tmp/hermes-insu-docx-final-qa/unified-map.svg`, and rendered QuickLook preview `/tmp/hermes-insu-docx-final-qa/ql/modoo-insu-sample-final.docx.png`.
- Inspection: DOCX has one SVG plus one PNG fallback, `지도 번호 범례` is present, old inline `지도 번호:` is absent, SVG contains no group-name text, table grids are explicit (`900/3100/6000` legend and `1720/1380...` monthly table), no page-break square tag remains, and privacy copy appears once.
- Verification: Python tests 64 passed; compileall passed; frontend tests 103 passed; frontend build passed; `git diff --check` passed; independent review PASS.

## 2026-07-07 — Screen quadrant legend and undo auto-hide

- Issue: 발표/워크숍 화면에서 fixed Undo 버튼이 우하단 콘텐츠를 계속 덮을 수 있었고, 화면판 업무지형도는 DOCX와 달리 업무명 라벨이 지도 위에 남아 겹침 가능성이 있었다. 연간 흐름의 업무묶음별 월분포도 0건 칸이 빈칸처럼 보였다.
- Change: Undo affordance now auto-hides after a 5-second grace period with timer cleanup; the screen 업무지형도 now matches the DOCX pattern with numbered colored markers on the map and a `업무 지형도 번호 범례` table below; annual-flow bundle distribution cells render explicit `0` values.
- Sample/demo: Existing `학급운영` year-round sample bundle remains in place so the demo map has a year-round/right-side bundle.
- Verification: RED tests failed before implementation for auto-hide, numbered screen map/legend, and 0-count cells; after implementation targeted tests passed. Full verification: Python tests 64 passed, compileall passed, frontend tests 104 passed, frontend build passed, `git diff --check` passed. Browser visual QA confirmed numbered markers 1–5 plus legend table and no visible Undo overlay.
- Review: independent blocker-only review PASS.
