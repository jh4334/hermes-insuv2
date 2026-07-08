# Claude Opus React Design Prompt

Hermes Insu product/UI design request. Reply in Korean, concise but actionable.

## Context
- Repo: `/tmp/hermes-insu`
- Current implementation: small Flask/Python MVP with domain tests.
- User asks to consider rebuilding UI as a React web app.
- User explicitly wants Claude to use Opus.
- User wants a hip/startup/product-tool frontend design, NOT a public-institution/government look.
- Prefer design inspiration from Framer/Linear/Stripe style: dark product cockpit, crisp typography, energetic but professional.

## Product frame
- Previous-year school documents/PDF metadata -> current-year operations board, review queue, calendar/workflow visualization, school export package.
- Handover is optional post-it memo only, not product core.
- Avoid raw PDF storage DB, automatic collection/watch folder, OCR/Tesseract install guidance, fake pilot metrics.

## Planned Iterations
1. Extraction candidate review table + operations board contract
2. Risk/review queue + work-card detail panel
3. Calendar/month flow + export basics

## Question
Should we move the UI to React/Vite while keeping Python domain/backend? Propose:
1. architecture,
2. UI layout,
3. design style,
4. next 3 iterations,
5. risks and mitigations.

Assume large UI redesign is allowed. Prioritize teacher usability and contest persuasiveness while keeping the product hip and modern.