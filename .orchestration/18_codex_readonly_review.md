# Codex read-only review — calendar-first simplification

Verdict: BLOCKERS initially.

Findings:
1. `frontend/src/App.tsx` still had stale dead helpers from removed Dashboard/Month/Gantt screens: `priorityTag`, `daysUntil`, `formatRange`.
2. `frontend/src/App.tsx` still had stale unreachable memo-edit handlers: `addMemo`, `changeTaskMemo`.

Non-blockers:
- No export/ICS/privacy blocker found.
- Windows packaging path remains compatible because `build_exe.py` bundles `frontend/dist`.

Resolution:
- Removed stale helpers/handlers and unused `Priority` import.
- Re-ran frontend tests/build and full verification.
