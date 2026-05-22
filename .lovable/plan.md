## Gap audit — Agent Cloud spec vs current build

I read the full 1697-line spec and inventoried the current routes, sidebar, and components. Here's what's present, what's thin, and what's entirely missing — grouped so you can pick a next slice.

### ✅ Already in place (at least as mock UI)
- Auth shell: login / signup / forgot-password / reset-password
- Sidebar groups: Overview, Workspace, My Business, Contracting, Resources, Back Office
- Pages: Dashboard, Notifications, Announcements, News Feed, Post a Deal, Pipeline, Calendar, Phone, AI Assistant, Team, Book of Business, Analytics, Finances, Challenges
- Contracting children: index, Invite, Transfers, Commission Grids, Annuity Training, Carriers
- Resources children: Scripts, State Licenses, New Agent Guide, Agent Handbook, Agent Academy
- Back Office children: Case Design, Advanced Desk, Recruiting Funnels, Recruiting Tracker, Client Marketing
- Sophai: Settings, Activity

### 🟡 Pages that exist but are thin vs spec
| Page | Missing per spec |
|---|---|
| Dashboard | Enrollment Tracker donut, time-range filter bar, dual-series production trend chart, 10 color-coded policy-status cards, Quick Overview cards |
| Pipeline | Client detail drawer needs all 9 tabs (Needs Analysis, Notes, Schedule, Beneficiaries, Referrals, Financials, Client Care, Policies, Email) with Sophai tips |
| Post a Deal | New/Existing client toggle, inline beneficiaries, auto-calc annual premium |
| Phone | Three tabs (Telephone keypad, SMS thread, Dial Lists), Settings panel, Wallet page with pricing table + usage breakdown |
| AI Assistant | 3-step activation flow + Policy Recovery panel stats |
| Team | Overview / Roster / Organization tabs, activation queue, org chart |
| Book of Business | Agents vs Carrier source toggle, filters |
| Analytics | 10 tabs (Daily/Overview/Individual/Team/Carriers/Trends/Policy/Quality/Recruiting/AI Coach), AI Insights cards, Trophy Cabinet |
| Finances | 12-month forecast chart, full payout schedule table, "how payouts are calculated" explainer, carrier/product/month breakdown |
| Contracting | Tabs: My / Downline (agent×carrier matrix) / Work Inbox |
| Calendar | Auto-generated event types (birthday, policy starting, beneficiary check-in, lapse follow-up) |

### 🔴 Entirely missing
**Sidebar groups & pages**
- **Tools group** — `/tools/needs-analysis`, `/tools/quoter`, `/tools/leads` (States/Marketplace/Dialer/My Orders), `/tools/inbound-calls`
- **Account group** — `/account/producer-profile` (3 tabs incl. E&O, Banking, DL, AML, agreement), `/account/my-landing-page`, `/account/help`, `/account/faq`
- **Top bar** — Phone, Chat, Shield (Sophai Recovery dropdown), Bell dropdown, theme toggle wiring

**Public / unauthenticated routes**
- `/join/[token]` — invitation link landing
- `/agent/[agent-slug]/[template-slug]` — deployed marketing landing pages
- `/myagent/[agent-slug]` — public agent landing page

**Onboarding**
- First-login wizard: phone, producer profile, fund wallet, sign agreement

**Backend (currently 100% mock)**
- No Supabase schema, RLS, or seed data
- No commission calc engine (75/25 standard, GTL 50% capped + 6-month tail, override spread)
- No Twilio / Stripe / AI integrations
- Roles table (`user_roles` + `has_role` SECURITY DEFINER) not set up

### Proposed next slices (pick one)

1. **Sidebar completeness + Tools & Account mock pages** — finish the nav surface so every spec route resolves; ~10 new mock pages (Tools×4, Account×4, top-bar dropdowns). UI-only.
2. **Fatten thin pages to match spec** — Dashboard + Analytics + Finances + Pipeline drawer + Phone tabs. Biggest visual upgrade, still UI-only.
3. **Public routes + onboarding flow** — `/join/[token]`, `/myagent/[slug]`, deployed landing template, first-login wizard. UI-only.
4. **Wire real backend (Phase 1 MVP)** — Supabase schema for profiles/clients/policies/carriers/commission_grids + RLS + roles + auth flow + seed data. Replace mock for Pipeline, Post a Deal, Book of Business, Carriers.
5. **Commission engine** — `commission_schedule` table + calculation logic (standard 75/25, GTL exception, override spread via recursive CTE) feeding Finances payouts.

### Recommendation
Do **slice 1** next (sidebar + Tools + Account + top-bar). It's the smallest amount of work that makes the navigation feel complete and gets every spec route to resolve. Then slice 2 to make the existing pages look "real," then move to backend.

Tell me which slice (or combination) to build and I'll execute.