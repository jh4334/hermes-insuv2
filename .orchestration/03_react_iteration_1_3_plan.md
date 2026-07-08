# Iteration 1-3 React Pivot Plan

## Source review
- Claude Opus was used for the React pivot design review.
- First long prompt with `--model opus --max-turns 1` failed with `Error: Reached max turns (1)`.
- Retried with a concise prompt using `--model opus --max-turns 3`; completed successfully.

## Design direction
- Use React/Vite + TypeScript for frontend.
- Keep Python/Flask backend and `hermes_insu/domain.py` as domain logic.
- Product UI should feel like a hip product cockpit inspired by Linear/Framer/Stripe, not a public-institution portal.
- Visual direction: dark canvas, crisp Inter typography, low-saturation panels, energetic blue/violet accent, dense but readable operational dashboard.

## Guardrails
- No raw PDF storage DB.
- No automatic document collection/watch-folder feature.
- No OCR/Tesseract install guidance for end users.
- No fake pilot metrics.
- Handover is optional post-it/reference memo, not the core product.
- Final distribution direction still supports `압축 풀기 → 모두의인수인계.exe 더블클릭`.

## Iteration 1
- Establish JSON API contract for analyze/operations board.
- Scaffold React/Vite frontend.
- Implement extraction candidate review table and operations board shell.
- Tests: Python route/domain tests + frontend unit tests + frontend build.

## Iteration 2
- Add review/risk queue and work-card detail panel.
- Add flags for missing date, title, owner, doc number, reference location, and dense month/week.
- Add optional post-it/reference memo display in detail panel.

## Iteration 3
- Add month/week workflow visualization and export basics.
- Export should include operations plan and review-needed list without fabricated results.
- Add smoke/build verification.
