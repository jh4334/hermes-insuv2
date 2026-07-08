# 18. Opus + Ultracode orchestration

## Updated default loop

- Claude side: Claude Opus + Superpowers/ultracode style review.
- Claude role: PM/UX/risk/spec/code-review gate, preferably read-only.
- Codex side: reliable `codex exec -C /tmp/hermes-insu` goal-style runs with OMO/LazyCodex hooks when available.
- Do not depend on `omo run` or `lazycodex run` runner paths unless their OpenCode runner dependency is explicitly verified.
- Hermes role: deterministic implementation cleanup, tests, browser QA, git commit, Windows build orchestration.

## Claude review command shape

```bash
claude -p "<concise review prompt with ultracode/ultrathink framing>" \
  --model opus \
  --effort max \
  --allowedTools "Read" \
  --max-turns 3
```

## Codex review command shape

```bash
codex exec -C /tmp/hermes-insu \
  -s read-only \
  -m gpt-5.5 \
  -c model_reasoning_effort=xhigh \
  "Review the current diff. Do not edit files."
```

## Current implementation target

Finish the calendar-first simplification:

- Landing screen is the annual calendar.
- Sidebar contains only: 캘린더 / 업무목록 / 내보내기.
- PDF upload stays at the top of the calendar screen.
- Annual ICS export stays in the calendar screen.
- Backup/import/successor handoff/CSV/reset stay in the export screen.
- Old Dashboard, Month Calendar, Gantt, and Memos screens are removed from navigation and code.

## Windows artifact target

After review and verification pass, build a Windows distribution ZIP through the existing GitHub Actions workflow and verify that the downloaded ZIP contains the expected `.exe` and end-user instructions.
