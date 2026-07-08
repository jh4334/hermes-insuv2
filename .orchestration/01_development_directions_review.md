# Hermes Insu Development Directions Review

## Context

`hermes-insu` is the concept-reset successor to `codex-insu`. `codex-insu` remains the runnable stable line. This repo should rebuild around the newly agreed product frame:

- Main product: previous-year school document metadata/PDFs -> current-year operations board, work-plan draft, calendar/workflow visualization.
- Handover: optional post-it style reference memo attached to work cards, not a mandatory handover-document writing burden.
- Avoid for now: raw PDF storage DB, attachment repository, watch-folder/automatic collection, OCR/Tesseract install requirements for final users, fake pilot metrics.
- Keep evidence trail through document number + source date + reference location.

## Draft: 10 Development Directions

### 1. PDF Ingestion + Extraction Review Table
Build a PDF upload/import flow that extracts only surface metadata needed for operations planning: source date, title, document number, owner/department, and confidence/review flags. Every extracted row must be editable before plan generation.

### 2. Current-Year Operations Board Generator
Turn previous-year document rows into current-year work cards. Preserve source evidence, roll forward dates/titles, classify basic stages, and mark rows needing manual confirmation.

### 3. Calendar + Workload Visualization
Provide yearly/monthly/weekly calendar views and month/week workload density. Calendar is for understanding workload flow, not merely exporting alarms.

### 4. Work-Card Detail Context Panel
Each work card should show prior-year title/date/owner/document number, target date, stage, evidence, reference location, confirmation status, and optional post-it memo in one detail panel.

### 5. Post-it Reference Memo UX
Replace heavy handover-writing language with quick optional memo UX: common chips, reference-location field, one-line caution/note, and completion/support status only where useful.

### 6. Workflow Grouping and Stage Chains
Group related documents into workflows such as `계획 -> 품의 -> 운영 -> 결과보고`. This makes the tool stronger than a simple calendar generator.

### 7. Risk/Review Queue
Surface practical review queues: missing date, missing owner, low confidence, missing reference location, possible result-report omission, deadline-heavy weeks, and duplicated/overlapping work.

### 8. Export Package for School Use
Generate a practical output package: current-year work-plan table, monthly calendar summary, review-needed list, workflow groups, and optional reference memo appendix. Avoid calling it only “handover document.”

### 9. Pilot Evidence Forms and Research Report Support
Provide blank measurement forms and report-copy templates for real pilot data: task-analysis time, correction count, usefulness rating, reuse intention. Never fabricate metrics.

### 10. Windows EXE Distribution Pipeline
After the core UX stabilizes, add GitHub Actions Windows packaging so final users receive only a ZIP: unzip -> `모두의인수인계.exe` or renamed executable double-click. No Python/pip/terminal guidance for final users.

## Initial Priority Hypothesis

- P0: 1, 2, 3, 4, 7
- P1: 5, 6, 8
- P2: 9, 10

## Review Questions

1. Which directions are essential for research-contest persuasiveness?
2. Which directions are essential for real teacher usefulness?
3. Which directions risk scope creep or user burden?
4. What should be built in the next 3 iterations only?
5. What wording should be avoided to keep the app from sounding like extra handover work?
