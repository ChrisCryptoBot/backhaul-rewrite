# KPI Tracker Frontend Integration Plan

## Source Reviewed

- Design package extracted from `KPI TRACKER.zip` into `backhaul/kpi-tracker-design`.
- Primary design files reviewed:
  - `screen-board.jsx`
  - `screen-drawer.jsx`
  - `screen-dashboard.jsx`
  - `tokens.css`
  - `styles.css`
  - `data.js`
- Current implementation baseline reviewed in `apps/web`:
  - `src/app/page.tsx`
  - `src/app/globals.css`
  - `src/app/api/board/route.ts`
  - `src/server/board.ts`
  - write-path APIs (`api/fsc`, `api/rate-confirmations`)
  - related tests under `apps/web/tests`.

## Executive Gap Summary

The design package is a rich static prototype with complete visual language and interaction intent, while the current app is still a server-rendered MVP shell focused on policy-safe data plumbing. Core data primitives are already present, but UI composition, client-side state, and several read APIs are missing.

### P0 Gaps (Blockers)

1. **No component architecture for the board UI**
   - Current `page.tsx` renders plain HTML sections/tables.
   - Design requires multi-region layout (topbar, rail, table, sticky footer, drawer).
2. **No row-detail drawer implementation**
   - Prototype expects row click to open a side panel with timeline/financials/ops detail.
3. **No KPI dashboard route/page**
   - Prototype includes an entire weekly dashboard with tabs and trend chart.
4. **No read endpoints for footer upload/pending/recent widgets**
   - Write upload endpoint exists, but no retrieval model for `pending`, `ready`, `recent`.

### P1 Gaps (High Value)

1. **Design token system not integrated**
   - Current styles are minimal and light themed.
2. **Date/week navigation UI + parsing not wired**
   - Prototype has day picker for board and week scope for KPI dashboard.
3. **Interaction parity missing**
   - Section rail active state, table row selection, tab switching, contextual badges.

### P2 Gaps (Quality/Completeness)

1. Accessibility hardening (keyboard flow, focus traps, ARIA labels).
2. Visual regression checks for dense dark UI.
3. Performance guardrails for larger load sets.

## Integration Strategy

Use a **strangler migration**: keep existing server contracts and policy controls, but replace the page shell with modular components and add narrowly scoped read APIs for UI-only data needs.

### Guiding Principles

- Preserve existing region/auth/policy behavior.
- Keep fallback dev mode behavior intact.
- Reuse existing board response contract where possible.
- Add fields/endpoints only when needed for specific UI elements.
- Ship in small vertical slices with tests at each slice.

## Target UI Architecture

Implement under `apps/web/src`:

- `app/(board)/page.tsx` (server entry)
- `app/(board)/dashboard/page.tsx` (weekly KPI dashboard)
- `components/board/*`
  - `BoardShell`
  - `TopBar`
  - `LeftRail`
  - `BoardTable`
  - `SectionHeaderRow`
  - `LoadRow`
  - `DropBucketFooter`
- `components/drawer/*`
  - `LoadDetailDrawer`
  - `Timeline`
  - `FinancialSummary`
  - `RateConCard`
- `components/kpi/*`
  - `KpiHeader`
  - `KpiCardGrid`
  - `KpiTabs`
  - `LanesTable`
  - `TrendPanel`
  - `ManagementReportPanel`
  - `RulesPanel`
- `lib/ui/*`
  - formatters
  - status/color maps
  - typed view mappers from API contract

## API and Data Contract Plan

### Reuse Existing

- `GET /api/board?date=YYYY-MM-DD` as primary board source.
- Existing `BoardResponse` fields already cover most board table values.

### Add (Required)

1. **Drawer details endpoint**
   - `GET /api/board/load/:id`
   - Includes:
     - identifiers (`routeId`, `loadNumber`, `pickupNumber`)
     - timeline events (booked/dispatch/pickup/delivery/pod/completed timestamps)
     - financial detail (line haul, FSC amount/rate used, miles, RPM variants)
     - ops detail (broker, driver, equipment, status notes)
     - rate confirmation metadata/link.

2. **KPI weekly endpoint**
   - `GET /api/kpi?weekIso=YYYY-Www`
   - Returns:
     - KPI cards
     - lane rows
     - trend points
     - management note payload
     - reference rules list.

3. **Upload activity endpoint for footer**
   - `GET /api/rate-confirmations/activity?date=YYYY-MM-DD`
   - Returns:
     - pending parse jobs
     - ready-for-review docs
     - recent processed list.

## Phased Delivery Plan

## Phase 1: UI Foundation and Tokenization

Scope:
- Introduce dark theme tokens from `tokens.css` into `globals.css` (scoped variables).
- Add component-level stylesheet modules (or one board stylesheet initially).
- Implement reusable atoms:
  - status pill
  - mono numeric formatter
  - compact button variants.

Acceptance:
- No functional changes.
- Existing page still works.
- Lint/typecheck/tests green.

## Phase 2: Daily Board Shell Parity

Scope:
- Replace plain page markup with board shell layout:
  - top bar
  - rail
  - table with sticky header
  - section headers + empty-section row
  - sticky drop bucket footer shell.
- Wire section counts and selected-row state.
- Keep data from existing board endpoint.

Acceptance:
- Visual parity for screen-board structure.
- Empty-day and mixed-load states render correctly.
- Existing board tests updated and passing.

## Phase 3: Row Detail Drawer

Scope:
- Add client-selected row -> drawer open/close.
- Implement drawer with staged sections (Identifiers, Timeline, Geography, Financials, Ops, Rate Con, Audit).
- First pass can hydrate from row data + placeholder timeline.
- Second pass integrates `GET /api/board/load/:id`.

Acceptance:
- Click row opens drawer; Esc and close button work.
- Keyboard focus is trapped in drawer while open.
- Drawer data resolves and error states are handled.

## Phase 4: KPI Dashboard Route

Scope:
- Add `/dashboard` page with:
  - KPI card grid
  - tabs (`Lanes`, `Trend`, `Management Report`, `Reference Rules`)
  - table/chart panels.
- Initially hydrate from static adapter; then move to `GET /api/kpi`.

Acceptance:
- Tab interactions fully client-side.
- Trend chart renders from API data points.
- Week selector drives endpoint query and refresh.

## Phase 5: Drop Bucket Footer Real Data

Scope:
- Connect footer pending/recent widgets to activity endpoint.
- Tie upload CTA into existing `POST /api/rate-confirmations`.
- Add optimistic and polling states for parse progress.

Acceptance:
- Uploaded docs appear in pending, then transition to parsed/ready.
- Activity list reflects backend processing lifecycle.

## Phase 6: Hardening, A11y, and CI Confidence

Scope:
- Add accessibility and keyboard nav tests.
- Add visual regression snapshots for board + drawer + dashboard.
- Add performance checks for large board datasets.

Acceptance:
- CI includes lint, typecheck, unit tests, and component regression checks.
- No auth-bypass behavior leaks into production mode.

### 2026-05-03 implementation note

- Trend panel chart strategy is now **chart library-based** (interactive chart surface replacing static SVG).
- Trend range is driven by query-backed windowing and is kept in sync with the trend table rows.
- Trend points support hover, keyboard focus, and tap interaction with metric popup content.
- Visual regression coverage now includes dense trend windows and dark-mode trend baseline.
- Remaining hardening focus: keep accessibility and regression coverage aligned as chart interactions evolve.

## Test Plan Expansion

Add/extend tests in `apps/web/tests`:

1. **Board render tests**
   - section counts, sticky scaffolding, empty rows, status pill mapping.
2. **Drawer interaction tests**
   - row click open/close
   - keyboard close
   - async detail fetch success/failure.
3. **KPI dashboard tests**
   - tab switching
   - week query mapping
   - lane status rendering.
4. **API tests**
   - `api/board/load/:id` auth + policy + payload shape
   - `api/kpi` validation and output contract
   - `api/rate-confirmations/activity` state grouping.
5. **Regression tests**
   - dev bypass behavior remains read-safe
   - write-path policy still enforced.

## Recommended Build Order (1-week sprint model)

- Day 1: Phase 1 foundation
- Day 2: Phase 2 board shell
- Day 3: Phase 3 drawer v1
- Day 4: Phase 4 KPI dashboard
- Day 5: Phase 5 footer activity + Phase 6 hardening kickoff

## Open Decisions Needed

1. Should KPI dashboard be protected by same auth mode as board page, or read-public in dev only?
2. Do we store timeline events in DB now, or derive from existing status timestamps until event sourcing is added?
3. Should footer activity polling be interval-based (e.g. 5s) or SSE/WebSocket in later phase?
4. Preferred chart strategy for trend panel:
   - custom SVG (prototype style, no deps),
   - lightweight chart package,
   - server-rendered sparkline SVG.

## First Implementation Slice (Immediately Actionable)

If execution starts now, begin with:

1. Integrate tokens + board shell component skeleton.
2. Migrate current board table into styled `BoardTable`.
3. Keep current `GET /api/board` contract unchanged.
4. Add row-selection state and stub drawer container.

This delivers visible front-end progress quickly without blocking on new backend endpoints.
