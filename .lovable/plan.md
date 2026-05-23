## Advanced Back Office — Build Plan

Build two new pages under "Your Back Office": **Case Design** (expert underwriting consultation) and **Advanced Desk** (retirement planning center). Minimal v1 scope for the planner.

---

### Database (one migration)

**`case_design_requests`** — full spec as written. RLS: agent sees own + admin sees all. Admin can update `status` / `response_html` / `responded_at`.

**`retirement_cases`** — full spec as written. RLS: agent owns + downline read + admin all. Trigger keeps `updated_at` fresh.

---

### Sidebar
Add two new entries to the existing "Your Back Office" group in `app-sidebar.tsx`:
- Case Design → `/back-office/case-design`
- Advanced Desk → `/back-office/advanced-desk`

---

### Page 1: Case Design — `/_authenticated/back-office/case-design.tsx`

- Header + 2-column info section + 3 service highlight cards + 3-step process strip
- **Submission form** (client typeahead OR manual; coverage, product, health, height/weight, tobacco, prior decline conditional, occupation, hobbies, notes). Zod validation; required fields = coverage, product, primary condition.
- On submit: server fn inserts `case_design_requests` (`status='pending'`) + writes a `notifications` row. Success card replaces form area.
- **My Submissions** table below, hidden when empty. Status badges (Pending/Complete/Needs Info). Clicking a "Complete" row opens a Sheet with the underwriter's `response_html` (sanitized render).

### Page 1b: Admin review — `/_authenticated/back-office/case-design/admin.tsx`
- Gated by `has_role('admin')`; non-admins redirected.
- Table of all pending/recent cases. Row click → Sheet with full case details, a status dropdown, and a rich-text-ish textarea for `response_html` (basic markdown→HTML on save). Saving sets `responded_at = now()` and notifies the agent.

---

### Page 2: Advanced Desk — `/_authenticated/back-office/advanced-desk.tsx`

Three top-level tabs: **Planner | Case Tracker | Needs Attention**.

#### Planner (minimal v1)
- Left input panel (380px): demographics, savings & growth, assumptions modal, accounts list (Add Account dropdown with all 16 types stored as `accounts` jsonb rows: `{id, type, name, balance, monthly_contrib, return_pct, tax_class}`), income sources modal, linked policies (search from `policies` table for this client), expenses/healthcare inputs.
- Top metric row (5 cards) with green/yellow/red coloring on success probability.
- **Analysis tabs (only 4 in v1)**: Summary, What-If, Cash Flow, Report. The other 9 tabs (Risk, Income, Expenses, Taxes, Health, Roth, Floor, Legacy, Scenarios) render a "Coming soon" placeholder.
  - **Summary**: circular gauge of readiness score + narrative paragraph (template-driven, not AI) + top-3 recommended actions (rule-based).
  - **What-If**: 4 debounced sliders (retire age, monthly contribution, expected return, part-time income toggle) updating a small Recharts line of nest egg trajectory.
  - **Cash Flow**: year-by-year table + Recharts stacked area chart (growth phase / distribution phase / guaranteed income overlay).
  - **Report**: "Print Report" button using `window.print()` + a print stylesheet. No jsPDF.
- **Calc engine** (`src/lib/retirement-calc.ts`, pure functions): deterministic projection only. Success probability = heuristic (portfolio-lasts-to-life-expectancy yes/no with simple stress test at -2% return), not Monte Carlo.
- **Auto-save**: once a case is loaded/created from Case Tracker, debounce inputs 2s and call `saveRetirementCase` server fn. Scratch work without a case lives in component state.

#### Case Tracker
- "+ New Case" → client search → creates `retirement_cases` row (status=draft) and switches to Planner tab with that case loaded.
- Table: Client | Created | Status | Nest Egg | Success % | Last Modified | Next Meeting. Row click loads case into Planner.

#### Needs Attention
- Server fn returns cases matching: success_probability_pct < 70 OR updated_at < now()-90d OR (retirement_age - current_age) <= 5.
- Alert cards with "Open Case" button switching to Planner.

---

### Server functions (`src/lib/back-office.functions.ts`)

`submitCaseDesign`, `listMyCases`, `getCaseDetail`, `listAllCasesAdmin`, `updateCaseResponseAdmin`, `createRetirementCase`, `saveRetirementCase`, `listRetirementCases`, `getRetirementCase`, `getNeedsAttention`. All use `requireSupabaseAuth`.

---

### Out of scope for v1 (explicit)
- 9 analysis tabs (Risk/Income/Expenses/Taxes/Health/Roth/Floor/Legacy/Scenarios) — placeholders only
- Monte Carlo 1000-path simulation — replaced with heuristic
- jsPDF report — replaced with `window.print()`
- AI-generated Summary narrative — replaced with template
- Scenario comparison saving
- Recharts fan chart, glide-path allocation viz

These can be added in follow-up requests without schema changes.
