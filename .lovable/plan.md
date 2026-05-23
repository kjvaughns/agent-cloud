## Dashboard Section Build Plan

Build out the 5 existing stub routes (`dashboard`, `notifications`, `announcements`, `news-feed`, `post-deal`) into the full spec. All 5 route files already exist in `src/routes/_authenticated/` and will be rewritten.

### 1. Database (single migration)

- `notifications` already exists — add `type text` column.
- `announcements` already exists — no changes (RLS already restricts writes to admins; will extend `announcements_admin_write` to also allow `manager` role).
- New: `news_articles` (id, title, summary, url unique, source_name, category, image_url, published_at, fetched_at). RLS: read for all authenticated; writes via service role only.
- New `app_role` value `manager` (if not present) — verify and add.
- Helper RPC `get_dashboard_metrics(_scope text, _range_start timestamptz, _range_end timestamptz)` → returns individual + team production $, policy counts, donut breakdown (active vs in_review last 30d), status counts grid, active downline count, active contracts count, and a 12-month monthly trend series (individual + team, $ and policy count). Uses recursive downline CTE + `auth.uid()`. `SECURITY DEFINER`.
- Trigger on `policies` INSERT: insert a `calendar_events` row 30 days before `effective_date` titled "Policy Starting Soon"; insert `notifications` row "New Deal Posted — …" for the agent.
- Cron: daily job calling `/api/public/hooks/fetch-news` (server route) using `apikey` header; second daily job to delete `news_articles` older than 90 days (SQL only).

### 2. Server functions (`src/lib/*.functions.ts`)

- `dashboard.functions.ts`: `getDashboardMetrics({ range, customStart, customEnd })` → wraps the RPC.
- `notifications.functions.ts`: `listNotifications`, `markRead({id})`, `markAllRead`, `dismiss({id})`, `clearAll`.
- `announcements.functions.ts`: `listAnnouncements`, `createAnnouncement({title, bodyHtml})` (role-gated check inside handler), `canPostAnnouncements()`.
- `news.functions.ts`: `listNewsArticles({category?})`.
- `post-deal.functions.ts`: `searchClients({q})`, `listCarriers()`, `postDeal(payload)` — creates client (if new), policy (status `in_review`), beneficiaries (validate sum = 100), returns new policy id.
- `dashboard-lookups.functions.ts`: `getEnrollmentDonut()` for last-30-day donut on Overview.

### 3. Server route

- `src/routes/api/public/hooks/fetch-news.ts` — POST handler validated by Supabase `apikey`. Fetches LIMRA, Insurance Journal, NAIC, ThinkAdvisor RSS feeds, parses XML with `fast-xml-parser`, upserts into `news_articles` keyed on `url`. Categorizes by source mapping.

### 4. UI

**Overview (`dashboard.tsx`)**
- Header + Enrollment Tracker card (Recharts PieChart donut, green/purple).
- Time range toggle bar (Today/7/30/90/All/Custom) — state synced to URL search params via TanStack Router `useSearch`. Custom opens `Popover` + shadcn `Calendar` range.
- 4-card KPI grid (Individual $, Team $, My Policies, Team Policies) with lucide icons and skeletons.
- Production trend Recharts `AreaChart`, 12 months, dual series (blue/green), `[$ Prod] [# Policies]` toggle (local state), overlay mini-stats with % vs prior period.
- Quick Overview pair (Active Downline / Active Contracts).
- Policy Status 2×5 grid — cards link to `/book-of-business?status=…`. Colors per spec via tailwind tokens.
- Bottom quick links row.

**Notifications (`notifications.tsx`)**
- Empty state + list. Item: unread blue dot, relative time (`date-fns formatDistanceToNow`), X to dismiss. Mark-all and Clear-all buttons.
- Realtime: `supabase.channel('notifications').on('postgres_changes', …)` filtered by `user_id`, invalidates query.

**Announcements (`announcements.tsx`)**
- Feed. "Read More" expand for long bodies (line-clamp + state).
- Admin/manager: "+ New Announcement" Dialog with Tiptap editor (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`). Renders bodies via sanitized HTML (`isomorphic-dompurify`).
- Empty state.

**News Feed (`news-feed.tsx`)**
- Source tabs (All / Life Insurance / Medicare / Annuities / Regulations) using shadcn Tabs.
- Article cards with category badge, headline, summary, source, date, Read → (opens new tab).
- Last-updated timestamp + manual Refresh button (invokes refetch only; cron handles ingest).
- Error/empty states.

**Post a Deal (`post-deal.tsx`)**
- React Hook Form + Zod schema.
- Client-type radio: New vs Existing. Existing → Command/Popover typeahead searching by name/phone.
- Sections per spec: Client info (phone mask), Policy details (Carrier searchable Combobox loaded from `carriers`; Product dropdown depending on carrier; Effective date picker; Annual = monthly × 12 displayed read-only in green).
- Beneficiaries: dynamic field array; relationship select; live sum-of-percentages indicator; blocks submit if ≠ 100.
- Notes textarea with `value.length / 2000` counter.
- Carrier-without-contract warning (non-blocking) — checks `agent_commission_levels`.
- On submit: call `postDeal`, toast, `router.navigate({to: '/book-of-business'})`.

### 5. Dependencies to add

`@tiptap/react @tiptap/starter-kit @tiptap/extension-link isomorphic-dompurify fast-xml-parser react-hook-form @hookform/resolvers zod date-fns` (any already present will be skipped).

### 6. Sidebar / shell

- Verify `Dashboard` group in `src/components/app-sidebar.tsx` (or equivalent) lists Overview / Notifications / Announcements / News Feed / Post a Deal with the routes above.
- Add notifications unread badge to bell in top header (subscribe via TanStack Query + Realtime).
- Add "new since last visit" dot to Announcements sidebar item (localStorage timestamp).

### 7. Verification

- Run migration; confirm linter clean.
- Curl `/dashboard`, `/notifications`, `/announcements`, `/news-feed`, `/post-deal` (after login) → expect 200.
- Smoke-test `postDeal` happy path via server-function invoke.
- Trigger `/api/public/hooks/fetch-news` manually once to seed news.

### Open questions before building

1. **News ingestion**: Do you want me to provision the cron jobs (pg_cron + pg_net + an `apikey`-protected `/api/public/hooks/fetch-news` route) right now, or stub the news feed with a manual refresh button and wire cron later?
2. **Manager role**: The spec gates "+ New Announcement" to admin/manager, but the current `app_role` enum only has `admin | agent | user` (based on `has_role` usage). OK to gate it to `admin` only for now (keep spec parity by adding `manager` later), or add the `manager` role in this migration?
3. **Tiptap vs simpler editor**: Tiptap pulls ~6 packages. Acceptable, or prefer a lighter Markdown textarea + preview?
