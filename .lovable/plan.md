
# Agent Cloud — Build Plan

Goal: ship the **entire UI surface** of the AgentLink-style platform with realistic mocked data, using **your own Supabase project** (not Lovable Cloud) for auth + schema. Twilio, Stripe, and AI integrations are stubbed so the screens are real and clickable, but no external services are called yet.

Scope is huge — this plan covers the foundation + page scaffolding. After this lands we'll iterate page-by-page to polish interactions and wire real data.

---

## 1. Supabase setup (your project)

I need three values from your Supabase project before I build:
- `SUPABASE_URL` (e.g. `https://xxxx.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY` (the anon/publishable key — safe in browser)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used in server functions)

I'll add these as project secrets via the secret tool. Vite-public copies (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) will be set so the browser client works.

I'll generate a single SQL migration file (`supabase/migrations/0001_init.sql`) you run against your DB containing:
- Enums (`app_role`, `policy_status`, `pipeline_stage`, `temperature`, `contract_status`, `recruiting_stage`, `wallet_txn_type`, `event_type`, `script_category`, `challenge_type`)
- All 35+ tables from the spec
- `user_roles` table + `has_role()` security-definer function (no role on profiles)
- `is_in_downline(upline uuid, target uuid)` recursive helper
- RLS policies on every table: agents see own rows; managers/admins see downline via `is_in_downline`
- Trigger to auto-create `profiles` + default `wallet` row on signup
- Seed data: `states_reference` (50 states), `carriers` (~10 sample), `scripts` (6 categories)

## 2. Design system

Update `src/styles.css` with the spec's palette in `oklch`:
- `--primary` blue `#3B82F6`, `--success` green `#22C55E`, `--warning` amber `#F59E0B`, `--destructive` red `#EF4444`, `--muted` slate `#64748B`
- `--sidebar` dark navy `#0F172A` with white foreground
- Inter font via `@import` in styles.css
- Status color tokens: `--status-active`, `--status-review`, `--status-lapse-pending`, `--status-lapsed`, `--status-cancelled`, `--status-withdrawn`, `--status-not-taken`, `--status-postponed`, `--status-carrier-na`
- Temperature tokens: `--temp-hot`, `--temp-warm`, `--temp-cold`
- Dark mode variants for all of the above
- Theme toggle (sun/moon) wired to `class="dark"` on `<html>`, persisted to localStorage

## 3. Shell + navigation

- `src/routes/__root.tsx`: QueryClientProvider, Supabase auth listener (invalidate router/queries on sign-in/out), top nav (48px) + sidebar (240px collapsible, navy), `<Outlet />`
- `AppSidebar` component using shadcn `Sidebar`, grouped: Dashboard / Workspace / My Business / Contracting / Resources / Your Back Office; active route highlight via `useRouterState`; collapse state in localStorage
- Top nav icons: Phone, SMS, Sophai Shield (dropdown with toggle + 4 stats), Bell (notifications dropdown), theme toggle, profile menu
- `_authenticated` pathless layout route gating everything except `/login`, `/signup`, `/onboarding`, marketing landing pages

## 4. Auth

- `/login`, `/signup`, `/forgot-password`, `/reset-password` (required public route)
- `/onboarding` wizard: phone number → upload state license → fund wallet (mocked top-up)
- Browser Supabase client + `requireSupabaseAuth` middleware (already in template)
- `useAuth` hook reads session + role + downline depth via a `getMe` server fn

## 5. Pages (all 25 build to spec; data is mocked from seed + RLS-filtered tables)

Implemented with full layout, components, empty states, skeleton loaders, and the exact tabs/filters/columns/badges described:

1. `/dashboard` – Overview (KPI cards, time-range filter, Recharts area chart, status grid, enrollment tracker)
2. `/notifications`
3. `/announcements`
4. `/news-feed` (mocked RSS items)
5. `/post-deal` (full form, beneficiary inline add, auto-calc annual)
6. `/pipeline` – Kanban + side-drawer Client Detail with 9 tabs (Needs Analysis, Notes, Schedule, Beneficiaries, Referrals, Financials, Client Care, Policies, Email)
7. `/calendar` – Month/Week/Day with auto-generated event types
8. `/phone` – Telephone keypad / SMS two-pane / Dial Lists / Settings / Wallet sub-tabs
9. `/ai-assistant` – Sophai intro + activation checklist
10. `/team` – Overview / Roster / Organization tabs, depth chart, activation queue
11. `/book-of-business` – Sortable table, Agent/Carrier toggle, status badges
12. `/analytics` – 10 tabs, AI Insights cards, sales challenges, trophy cabinet
13. `/finances` – Forecast chart, KPI cards, commission breakdowns
14. `/contracting` – My/Downline/Inbox tabs, status chips, expandable cards
15. `/contracting/invite` – Invitation link builder with commission assignments
16. `/contracting/transfers`
17. `/contracting/commission-grids` – Expandable accordion with highlighted level
18. `/contracting/annuity-training` – PDF upload state
19. `/contracting/carriers` – 2-col carrier cards
20. `/resources/scripts` – 6 category cards + script view
21. `/resources/state-licenses` – State grid with license/unlicensed states
22. `/resources/new-agent-guide`, `/agent-handbook`, `/agent-academy` – content shells
23. `/back-office/recruiting-funnels` – Templates + My Websites tabs
24. `/back-office/recruiting-tracker` – 5-column Kanban
25. `/back-office/case-design` – Submission form + info
26. `/back-office/client-marketing` – 7 landing page templates
27. `/back-office/advanced-desk` – content shell

Each route gets its own `head()` with route-specific title/description.

## 6. Shared components

`StatusBadge`, `TemperatureBadge`, `KpiCard`, `RechartsArea`, `RechartsBar`, `ClientDetailDrawer`, `KanbanBoard`, `EmptyState`, `MoneyDisplay` (Intl.NumberFormat), `PhoneNumber` formatter, `RoleGate`.

## 7. Mocked integrations (UI-ready, no external calls)

- Twilio: `useTwilioMock` returns fake call/SMS state; keypad, dialer, SMS thread all functional UI
- Stripe wallet top-up: simulated `wallet_transactions` insert
- Sophai AI: static script flow + canned tips; activity feed reads from `sophai_activity` table
- All seeded with realistic sample data so every screen looks alive

## 8. What's deferred (called out, not built)

- Real Twilio Voice/SMS, Real Stripe, Real OpenAI/Claude, NIPR sync, WebCE deep-link, RSS aggregator, landing-page public renderer, recruiting funnel public renderer, org-chart tree visualization (placeholder), per-page CSV export, mobile responsive polish.

These are individually substantial — we'll tackle them in follow-up turns.

## Technical notes

- Stack: TanStack Start (existing template), TanStack Query for all reads, Recharts, Tiptap for the notes editor, lucide-react icons, Zustand only for sidebar/theme UI state
- All DB reads go through `createServerFn` + `requireSupabaseAuth` (RLS enforced as that user). Admin client only used in onboarding profile/wallet creation trigger.
- Manager/downline visibility uses recursive CTE in `is_in_downline()`; RLS policy: `USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id))`
- File is `*.functions.ts` (not under `src/server/`) to satisfy import-protection rules
- Migration file is the source of truth; you run it via Supabase SQL editor or `supabase db push`

## Deliverables of this first build

1. Working sign-up → onboarding → dashboard flow against your Supabase
2. Every sidebar link routes to a fully laid-out page (no 404s, no placeholders)
3. Pipeline + Post a Deal + Book of Business fully interactive against the DB
4. All other pages styled to spec with seeded/mocked data
5. SQL migration file ready for you to run
6. README section explaining how to apply the migration and rotate the keys

After approval I'll request the three Supabase secrets, then start implementing.
