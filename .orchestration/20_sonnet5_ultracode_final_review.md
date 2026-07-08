# Claude Sonnet 5 ultracode final code review

## Scope

Reviewed the current `hermes-insu` diff against `origin/main`, including the local fix made after the first Sonnet 5 review.

Command pattern used:

```bash
claude -p --model claude-sonnet-5 --tools "" --no-session-persistence --max-turns 1 --output-format json
```

The JSON result reported real model usage: `claude-sonnet-5`.

## Verification before review

- Python tests: `38 passed`
- Frontend tests: `23 passed`
- TypeScript/Vite build: success
- `git diff --check`: success
- Static scan of added lines for hardcoded secrets, shell injection, eval/exec, pickle, and formatted SQL: no findings

## First Sonnet 5 ultracode review

Verdict: PASS, no blockers.

Non-blocking suggestions included two useful checks:

1. Confirm whitespace-only group names cannot be saved.
2. Confirm the same named group does not accidentally receive a different color on later PDF appends.

The first was already covered by `groupName.trim().length > 0`. The second revealed an actual UX consistency gap: adding more PDFs to an existing `교육과정` group could create tasks with the same `group_name` but a different `group_color`.

## Fix from review

Added a regression test:

- `reuses an existing group color when adding more PDFs to the same named group`

Then updated `UploadHero.savePreview`:

- Normalize the entered group name.
- If an existing task has the same normalized `group_name`, reuse that task's `group_color`.
- Otherwise choose a random accessible palette color, preferring colors not already used.

This preserves both requirements:

- Same 업무명 stays visually consistent.
- New 업무명 prefers an unused random color.

## Final Sonnet 5 ultracode review

Verdict: PASS.

Claude review summary:

- No artificial PDF count cap or total upload-size cap.
- PDF extraction appends to existing board.
- Teacher-entered group/work name is required.
- Same named group reuses its color; new group prefers unused random accessible color.
- Fixed `taskCategories` / `categoryId` / `categorySource` workflow removed.
- Stages are limited to `계획 / 품의 / 보고 / 예산`.
- No blockers found.

Remaining non-blocking notes:

- The color palette has 8 colors, so the 9th+ distinct group may reuse a color by design.
- The modulo in `pickTaskGroupColor` is stylistically unnecessary after `Math.floor(random * length)`, but harmless.
- Backend PDF parsing uses in-memory reads (`uploaded.read()` and `pdfplumber.open(io.BytesIO(data))`), not disk persistence.
