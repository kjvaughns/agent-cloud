
## Current state (audit)

- **Status values** in `profiles.status`: only `active` and `pending` exist in DB. UI references `inactive`/`terminated` but nothing writes them except `deactivateAgent` → `terminated`.
- **Activation Queue / Team Command Center** (`src/routes/_authenticated/team.tsx` + `getTeamDownline`): admins/managers get the **full company tree** (root downline). Non-admin uplines correctly see only their own downline via `get_team_downline`. So for you (Kaeden, admin) the queue currently shows everyone — that's the "everyone sees everyone" bug.
- **Hide/Term**: no `hidden` flag on `profiles`. "Hide from Team Page" in the drawer is unwired. `deactivateAgent` sets `terminated` but the roster still shows them and counts them in KPIs.
- **Profile drawer**: currently a plain `Sheet` in `team.tsx` — does not match the AgentLink screenshot (blue gradient header, NPN/Phone/Location/Depth/Join/Last Active/Upline/Contracts grid, Carriers & Levels list, Quick Actions: Dashboard / Contracts / Email / Call, Hide from Team Page).
- **Onboarding for new agents**: `account/producer-profile.tsx` exists but isn't surfaced as a checklist on the dashboard. No agent-agreement signature capture on invite acceptance. No structured "current carrier contracts" table. `commission_level_requests` table exists but has no UI to request, and no upline/admin UI to fulfill.
- **AgentLink import** (`admin-import.functions.ts`): creates imported agents directly as production rows; doesn't create a `not_activated` placeholder profile that later upgrades to `pending` on invite acceptance.

## Plan

### 1. Status lifecycle (DB migration)

Expand `profiles.status` to: `not_activated` → `pending` → `active` → `hidden` / `terminated`. Add `is_hidden boolean default false` (separate from status so termed agents can also be hidden, and so production rollups can ignore `is_hidden`/`terminated` from roster lists without losing the data).

```text
not_activated  imported from AgentLink, no Agent Cloud account
pending        signed up, profile/agreement incomplete
active         profile complete + agreement signed + NPN on file
hidden         soft-removed from roster, production preserved
terminated     same as hidden but flagged red for reporting
```

Migration also adds: `profiles.agreement_signed_at`, `agreement_signature_html`, `agreement_agency_name` (default 'APEX Financial LLC'), `current_carrier_contracts jsonb` for self-reported existing carrier/agent-number list, and a `profile_completion_pct` view helper.

### 2. Hierarchy scoping fix (`team.functions.ts`)

- Activation Queue / Team Command Center default scope = **caller's own downline** for everyone, including admins. Add an **"Admin: view full company"** toggle (only visible to admins) that flips to `get_team_downline_for(root)`. Default off.
- Exclude `status in ('hidden','terminated')` from roster + KPI counts; add a "Show hidden/termed" toggle.
- Cross-account visibility: tighten the `profiles` RLS read policy so non-admin agents only see profiles where `upline_id = auth.uid()` OR `id = auth.uid()` OR they share an upline chain. `not_activated` rows are visible only to the upline + admins.

### 3. AgentLink-style profile drawer

Replace the current `Sheet` with a new `AgentProfileDrawer` matching the screenshot:

- Gradient header (avatar, name, email, status pill).
- Grid: Phone, NPN, Location (city/state), Depth, Join Date, Last Active, Upline, Contracts (active/total).
- Carriers & Levels list driven by `agent_commission_levels` joined to `commission_grids` (shows `CARRIER · LEVEL (pct%)` with profile-completeness chip).
- Quick Actions row: **Dashboard** (link to agent sales dashboard), **Contracts** (contracting tab), **Email** (mailto), **Call** (tel/click-to-dial).
- Footer link: **Hide from Team Page** (toggles `is_hidden`) + admin-only **Mark Terminated**.

### 4. Roster hide / term controls

- Row kebab menu gets: View Profile, Hide from Roster, Mark Terminated, Unhide. Hidden/termed rows filter out of default view; "15 hidden" chip (already in screenshot) opens a hidden-only view.
- Production (`policies`) keeps `agent_id` pointer — never deleted, so historical books-of-business remain attributed.

### 5. New-agent onboarding flow

On invite acceptance (`/contracting/invite` accept path):

1. Account creation form requires: first/last, email, **phone**, **NPN** (validated 10 digits), DOB, address.
2. **Agent Agreement** step: render the uploaded `producer-agreement.pdf` template inline as HTML with APEX Financial LLC substituted; capture typed signature → saves `agreement_signature_html` + `agreement_signed_at`. Required to leave `pending`.
3. Redirect to dashboard with a **"Complete Your Producer Profile"** checklist card.

Dashboard checklist card (new `OnboardingChecklist` component on `/dashboard`):

- ✅ Basic info & NPN
- ✅ Agent Agreement signed
- ⬜ **Upload PDB report** (NIPR) — file upload to `producer_documents` with type `pdb_report`. On upload, parser pre-fills `state_licenses` rows the agent can confirm.
- ⬜ **Add current carrier contracts** — repeatable rows: carrier (select from `carriers`), agent number, effective date, current level (free-text). Stored in new `agent_current_contracts` table.
- ⬜ **Request commission level** per carrier — button writes to `commission_level_requests` with carrier + requested level + note.
- ⬜ Direct deposit / banking (existing `producer_banking`).

Auto-promote `pending` → `active` when: NPN present + agreement signed + ≥1 state license + ≥1 current carrier contract OR upline manually approves.

### 6. Admin/Upline commission-level request inbox

New section on `/contracting` (or back-office): list pending `commission_level_requests` for downline agents. Approve → writes to `agent_commission_levels` with the agreed pct/level so financials match. Decline → status `declined` with reason.

### 7. AgentLink importer adjustment

`admin-import.functions.ts` creates new agents as `status = 'not_activated'`, links their imported production by `agent_email` match, and surfaces them with an **"Invite to Agent Cloud"** button in the roster instead of the activation queue. Existing already-active rows untouched.

## Technical details

**New tables**

```sql
agent_current_contracts (
  id uuid pk, agent_id uuid → profiles, carrier_id uuid → carriers,
  agent_number text, current_level text, effective_date date,
  notes text, created_at, updated_at )

producer_documents already exists — reuse with doc_type = 'pdb_report'
```

**Profile additions**

`status` allowed values widened (no enum — kept as text + CHECK trigger to allow easy data fixes); add `is_hidden bool`, `agreement_signed_at timestamptz`, `agreement_signature_html text`, `onboarding_completed_at timestamptz`.

**RLS**

- `profiles` SELECT: `auth.uid() = id` OR `upline_id = auth.uid()` OR `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'manager')` OR same-upline siblings (for org chart). Drop any policy that returns all profiles to authenticated.
- `agent_current_contracts`: agent + upline + admin read; agent write; upline/admin update commission level after approval.
- `commission_level_requests`: agent insert/select own; upline/admin update status.

**Server fns added**

`setAgentHidden`, `setAgentTerminated`, `getMyOnboardingChecklist`, `submitAgentAgreement`, `addCurrentContract`, `requestCommissionLevel`, `approveCommissionLevelRequest`, `uploadPdbReport`, `listPendingLevelRequests`.

**Files touched**

- `supabase` migration (new columns, table, RLS, status check)
- `src/lib/team.functions.ts` — hierarchy scoping, hide/term, KPI filter
- `src/lib/onboarding.functions.ts` (new)
- `src/lib/commission-requests.functions.ts` (new)
- `src/components/team/agent-profile-drawer.tsx` (new, replaces inline Sheet)
- `src/routes/_authenticated/team.tsx` — wire new drawer + admin-scope toggle + hidden filter
- `src/routes/_authenticated/dashboard.tsx` — `OnboardingChecklist` card
- `src/routes/_authenticated/contracting/invite.tsx` — accept flow with agreement step
- `src/routes/_authenticated/account/producer-profile.tsx` — current contracts + request level UI
- `src/routes/_authenticated/contracting/index.tsx` — pending level-requests inbox
- `src/lib/admin-import.functions.ts` — set imported agents to `not_activated`

## Out of scope for this pass

- NIPR API parsing of the PDB PDF (we accept the upload + manual confirm of states for now; full parsing is a follow-up).
- E-signature legal vendor (using typed-signature capture like AgentLink does).

Ready to build on approval.
