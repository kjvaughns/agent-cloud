
## Resources Section Build Plan

Build 5 pages under a new "Resources" sidebar group, with rich seeded content and read-only frontends (admins edit via DB).

### 1. Database migration

Add columns:
- `profiles`: `npn_number text`, `date_of_birth date`, `street_address text`, `city text`, `state text`, `zip_code text`

New tables (all RLS: SELECT for authenticated; admin-only writes unless noted):
- `handbook_sections` (sort_order, title, slug unique, content_html, updated_at)
- `scripts_v2` — extend existing `scripts` table: add `short_description`, `long_description`, `content_html`, `accent_color`, `sort_order` (keep existing `category`, `title`)
- `academy_courses` (title, slug, category, instructor_name, duration_minutes, thumbnail_url, sort_order, published, featured bool)
- `academy_modules` (course_id, title, sort_order, video_url, content_html, quiz jsonb, resource_urls jsonb)
- `course_progress` (agent_id, course_id, module_id, completed, completed_at, quiz_score) — owner RLS

`states_reference` and `state_licenses` already exist — reuse. Seed `states_reference` with all 51 rows (timezone, license_fee_cents, doi_url, prelicensing_url) if missing.

Seed:
- 7 handbook sections (Welcome, Commission, Carriers, Client Standards, Compliance, Recruiting, Tools) with realistic long-form HTML
- 6 scripts (Basic, Needs Analysis, Objection, Mortgage Protection, Beneficiary, Check-In) with full content_html + accent colors
- 8 academy courses + featured flag on "Final Expense Mastery"
- 51 states_reference rows

License expiry notification: DB function + trigger, or a daily cron — for v1, compute client-side and surface banner (skip cron to keep scope tight).

### 2. Sidebar

Add "Resources" group to `src/components/app-sidebar.tsx` with 5 child links.

### 3. Routes (all under `_authenticated`)

- `src/routes/_authenticated/resources/new-agent-guide.tsx` — 8-step checklist with progress ring; reads from profiles, producer_documents, contract_requests, agent_phone_settings, wallet, policies via one server fn `getOnboardingStatus`. Action buttons link to existing routes.
- `src/routes/_authenticated/resources/handbook.tsx` — sticky TOC sidebar + scroll-spy, print/PDF (window.print + html2pdf via dynamic import — or just print for v1).
- `src/routes/_authenticated/resources/scripts.tsx` — search + category filter pills + 3-col card grid; clicking opens full-screen Dialog with formatted script, Print/Copy buttons.
- `src/routes/_authenticated/resources/state-licenses.tsx` — summary stats row, search + timezone filter + sort, licensed-first grid, add/edit license modal, expiry banner.
- `src/routes/_authenticated/resources/academy.tsx` — featured banner, category tabs, course card grid. Card click → toast "Course viewer coming soon" (per chosen scope).

### 4. Server functions

`src/lib/resources.functions.ts`:
- `getOnboardingStatus` — returns 8 booleans + percent
- `getHandbookSections`, `getScripts`, `getCourses` (public reads via authed supabase)
- `getMyLicenses`, `upsertLicense`, `getStatesReference`

### 5. Components

- `OnboardingChecklist`, `ProgressRing`, `ScriptCard`, `ScriptViewerDialog`, `StateLicenseCard`, `LicenseFormDialog`, `HandbookTOC`, `CourseCard`, `FeaturedCourseBanner`

### Out of scope

- Admin edit UIs (DB-only)
- Course viewer page + quiz logic + progress tracking UI (cards only)
- PDF export of handbook (print only)
- Cron-based expiry notifications (client-side banner only)
- Real video assets in academy (thumbnail gradients + icons)
