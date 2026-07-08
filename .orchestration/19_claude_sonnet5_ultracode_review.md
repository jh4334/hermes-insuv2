# Claude Sonnet 5 + ultracode review and failure analysis

## Failure analysis

Earlier Claude CLI review attempts failed with `Error: Reached max turns` because the prompt asked Claude to inspect the repository/staged diff using tools while `--max-turns` was too low or the review context was too broad. A one-shot smoke test confirmed Claude itself was authenticated and usable. Model checks showed:

- `--model sonnet` resolves to `claude-sonnet-4-6`.
- `--model claude-sonnet-5` resolves to `claude-sonnet-5` and works.
- `--model claude-sonnet-5-0` is not available.

A tool-using Sonnet 5 staged-diff review still exhausted turns, so the stable pattern is:

1. Hermes precomputes a compact review context with `git diff --cached --stat`, targeted `git grep`, and selected implementation snippets.
2. Run Claude in no-tools print mode with the exact model:
   `claude -p --model claude-sonnet-5 --tools "" --no-session-persistence --max-turns 1 --output-format json ...`

This completed successfully with real `claude-sonnet-5` model usage.

## PDF size cap decision

The previous 50MB `MAX_CONTENT_LENGTH` cap existed as a generic web safety guard to avoid very large multipart requests. For this local-first desktop app, the user asked for no upload limitation beyond practical local machine capacity, so the artificial request-size cap was removed along with the old 20-file count cap. PDF extension and `%PDF-` magic-header validation remain.

## Sonnet 5 review verdict

PASS

- No PDF/request-size cap: `MAX_CONTENT_LENGTH is None` asserted; app.py cap removed.
- Group name: user input (`aria-label="업무명 입력"`) flows through `normalizeTaskGroupName` before save.
- Append not replace: `appendTasks` does `[...tasks, ...added]`.
- Random unused color: `pickTaskGroupColor` filters existing colors, falls back to full palette, uses `Math.random`.
- Fixed category workflow removed: `TaskCategoryControls.tsx`/`taskCategories.ts` deleted, replaced by `TaskGroupControls.tsx`/`taskGroups.ts`; tests confirm 업무묶음 selector/filter no longer rendered.
- Stages restricted to 계획/품의/보고/예산: `infer_stage` only returns those four values.

No blockers found in the provided evidence.
