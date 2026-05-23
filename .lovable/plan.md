## Recruiting Back Office — Build Plan

### 1. Database migration (extend existing tables)

`recruiting_funnels` — add: `template_slug text default 'get-contracted-now'`, `page_views int default 0`, `applications int default 0`. Make `slug` unique + not null. Set `published` default to `true`.

`recruiting_prospects` — add: `funnel_id uuid` (nullable, FK funnels), `source text`, `linked_agent_id uuid` (FK profiles). Stage enum already matches the 5 required values.

New tables:
- `recruiting_prospect_stage_history` — `prospect_id`, `from_stage`, `to_stage`, `changed_by`, `changed_at`. Trigger on `recruiting_prospects` UPDATE inserts a row when stage changes.
- `recruiting_prospect_notes` — `prospect_id`, `agent_id`, `note`, `created_at`.

`landing_pages` — add: `lead_count int default 0`. Existing schema already has the rest.

`profiles` — add `agent_slug text unique` (auto-set on signup from first_name+last_name+suffix).

RLS: owner_modify / downline_select pattern on all new tables, matching siblings.

### 2. Public routes (no auth)

- `src/routes/api/public/funnel-view.ts` — POST `{slug}`, increments `page_views` via `supabaseAdmin`. Fire-and-forget from public funnel page.
- `src/routes/api/public/funnel-apply.ts` — POST `{slug, first_name, last_name, email, phone, state, npn?, message?}`. Validates with zod, inserts `recruiting_prospects` (stage=new, funnel_id, recruiter_id from funnel), increments `applications`, inserts a notification for the recruiter.
- `src/routes/api/public/lead-submit.ts` — POST `{agent_slug, template_slug, first_name, last_name, phone, email, state, best_time}`. Inserts `clients` (stage=new) for that agent, increments `lead_count`, sends notification.
- `src/routes/join/$slug.tsx` — public recruiting funnel page. Loader uses `supabaseAdmin` to fetch funnel + recruiter profile. Renders headline, benefits, application form. Fires page-view ping on mount. On submit shows success screen.
- `src/routes/agent/$agentSlug/$templateSlug.tsx` — public landing page. Loader fetches agent profile + landing_page record by `agent_slug + template_slug`. Renders generic template with the chosen theme config.

### 3. Authenticated routes

`src/routes/_authenticated/back-office/`
- `recruiting-funnels.tsx` — tabs (Create New / My Websites). Template card with Create / Preview / Flyer (Flyer = toast "coming soon"). Create modal (name + slug + uniqueness check). My Websites list with stats (views, applications, conversion %, recruited production via SUM(annual_premium) on policies where agent.upline came through this funnel — computed in server fn).
- `recruiting-tracker.tsx` — stats row + 5-column kanban (@hello-pangea/dnd already in project if available, else native HTML5 DnD). Optimistic stage update via server fn. Add Prospect modal. Prospect detail Sheet/Drawer with stage history, notes timeline, manual stage buttons, delete.
- `client-marketing.tsx` — 3-col template grid (10 themes config), Quick Deploy (1-click upsert landing_pages row + copy URL toast), Preview modal, My Deployed Pages table.

### 4. Server functions (`src/lib/recruiting.functions.ts`, `src/lib/marketing.functions.ts`)

All use `requireSupabaseAuth`. Functions:
- `listFunnels`, `createFunnel`, `deleteFunnel`, `getFunnelStats(id)`
- `listProspects`, `createProspect`, `updateProspectStage`, `deleteProspect`, `getProspectDetail(id)`, `addProspectNote`
- `getRecruitingStats` (totals + breakdown by stage + conversion)
- `listLandingPages`, `quickDeployLandingPage(template_slug)`, `deleteLandingPage`
- `ensureAgentSlug` (called on first deploy)

### 5. Landing page template config

`src/lib/landing-templates.ts` exports an array of 10 templates: `{slug, name, category, gradient, headline, subhead, bullets[], cta_label, theme_class}`. The public landing page component reads the matching config and renders one generic layout themed by gradient.

### 6. Sidebar

Add "Your Back Office" group to `src/components/app-sidebar.tsx` with 3 children pointing to the new routes.

### 7. Out of scope (v1)

- Flyer PDF generation
- Onboarded → invitation email send
- Custom landing-page slug editor (only default `agent_slug/template_slug` URL; `custom_slug` column unused)
- Per-template bespoke layouts/calculators (single generic template + 10 themes)
- Lead/prospect CSV export

### Technical notes

- Page-view tracking: TSS public route + `supabaseAdmin` (RPC alternative rejected).
- Optimistic kanban updates with React Query `useMutation` + `onMutate` cache rewrite.
- Slug uniqueness checked server-side; collision returns typed error rendered inline in modal.
- Notifications use existing `notifications` table.
