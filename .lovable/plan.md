# Finances Page Build Plan

Replace the existing placeholder `src/routes/_authenticated/finances.tsx` with a full Finances page driven by a new `commission_schedule` table and auto-generation logic.

## 1. Database changes (migration)

**New table** `commission_schedule`:
- `id`, `policy_id` (FK policies), `agent_id` (FK profiles), `source_agent_id` (nullable, for overrides)
- `payment_date date`, `payment_type text` (advance/deferred/override/renewal)
- `amount numeric`, `status text default 'pending'`, `paid_at timestamptz`
- `carrier text`, `product text`, `is_gtl boolean default false`
- RLS: owner (`agent_id = auth.uid()`) + downline + admin (mirrors existing pattern)
- Indexes on `(agent_id, payment_date)` and `(agent_id, status)`

**Schema additions:**
- Add `level_pct numeric` lookup convenience (already have `assigned_pct` on `agent_commission_levels` — reuse it)
- Add `is_gtl boolean` flag to `policies` (or derive from product name)

**Trigger** `generate_commission_schedule()` on `policies` INSERT/UPDATE where `status='active'`:
- Computes total_year1 = annual_premium × agent's assigned_pct for carrier
- Standard: 75% advance on effective_date, 25%/3 split across months 10–12
- GTL: MIN(50%, $600) advance, balance split across months 7–12
- Walks `profiles.upline_id` up to 5 levels, inserts override rows for each positive spread

## 2. Server functions (`src/lib/finances.functions.ts`)

All protected with `requireSupabaseAuth`, scoped to current agent:
- `getFinancesSummary()` — returns Today / 90-day forecast / MTD / YTD / Direct total / Override total
- `getForecast12Months()` — monthly aggregates grouped by direct vs override
- `getPayoutSchedule({ status, type, carrier, dateRange })` — filtered rows for table
- `getBreakdownByCarrier()`, `getBreakdownByProduct()`, `getBreakdownByMonth()`, `getOverrideAgents()` — analytics tabs

## 3. UI (`src/routes/_authenticated/finances.tsx`)

Replace existing file. Sections in order:

**Header** — "Finances" + "Financial analytics & forecasting"

**4 KPI cards** (reuse `KpiCard`) — Today, 90-Day Forecast (green), MTD, YTD

**2 commission-type cards** — Direct (blue accent) / Override (green accent)

**12-month forecast chart** — Recharts `LineChart`, solid blue (direct) + dashed green (override), legend

**Collapsible "How payouts are calculated"** — shadcn `Accordion` with Standard / GTL / Override examples

**Scheduled Payouts table:**
- Filter row: Status, Type, Carrier, Date range (shadcn `Select` + `Popover` calendar)
- Sortable columns; colored badges per Type and Status
- Row click → policy detail modal (reuse `client-detail-drawer` pattern or new minimal modal)

**Breakdown tabs** (shadcn `Tabs`) — By Carrier (bar + table), By Product (table), By Month (area chart + table), By Agent overrides (table)

**Empty states** — friendly copy + "Post a Deal" CTA linking to `/post-deal`

**Loading** — `Skeleton` on every card/chart/table while queries pending

**Responsive** — KPIs `grid-cols-2 md:grid-cols-4`, chart wrapper scrolls on mobile

## 4. Navigation

Confirm `app-sidebar.tsx` "My Business" group already links to `/finances` (it does — no change expected, will verify).

## Technical notes

- Use TanStack Query pattern: `queryOptions` + `ensureQueryData` in loader + `useSuspenseQuery` in component
- All money via `fmtCurrency` from `src/lib/format.ts`
- Semantic tokens only (no raw hex); badge colors via existing tailwind utility patterns already in `finances.tsx`
- Loader gated under `_authenticated`, so no SSR auth race

## Open questions

1. **Policy detail modal** — should clicking a payout row open a full policy drawer (deal details, beneficiaries, contact history) or just a lightweight payment-history popover for that policy?
2. **Renewal payments** — spec lists "Renewal" as a payment type and badge, but the auto-generation logic only emits advance/deferred/override. Should renewals be generated automatically (e.g., year 2+ at a fixed renewal %) or only inserted manually for now?
3. **GTL detection** — flag via new `policies.is_gtl` column, or by matching `product ILIKE '%GTL%'`?
