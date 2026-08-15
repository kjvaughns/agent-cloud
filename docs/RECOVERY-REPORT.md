# Production Recovery — milestone reports

One report per milestone, in the format the brief asks for: what changed, the
root cause it fixed, the tests added and their results, the acceptance cases a
person can run by hand, what risk is left, and what comes next.

Written after the fact from the merged work, not from the plan. Where the plan
and the code disagree, the code is what is described.

Two conventions run through all of it:

- **Migrations are hand-applied.** Code ships before the migration, so every
  change is written to work in the window between the two. `supabase/migrations/PENDING.md`
  carries the queue and, for each entry, what the product does before it lands.
- **`scripts/*-check.ts`** are pure-behaviour assertions plus string checks that
  the call sites are wired to the module under test. `scripts/integration-check.sh`
  is different in kind: it applies every migration to a scratch Postgres and
  reads as a real user with RLS enforced.

---

## M1 — One canonical answer to what an agent earns

**PRs** #139–#144, #147, #150

### Files and migrations

| | |
|---|---|
| Added | `src/lib/compensation/resolve.ts`, `lookup.server.ts`, `src/lib/production/source.server.ts` |
| Changed | `src/lib/commission.functions.ts`, `post-deal` route and form, `my-contracts`, leaderboard, book of business, dashboard |
| Migrations | `20260814250000_production-date.sql` *(applied)* |
| Checks | `compensation-check`, `commission-wiring-check`, `post-deal-compensation-check`, `contract-compensation-check`, `leaderboard-check`, `production-source-check` |

### Root causes

**Four places computed commission, and they disagreed.** The calculator, Post a
Deal, My Contracts and the schedule generator each had their own idea of which
percentage applied. `agency_levels.base_pct` **is** the ladder; nothing else is.
Every caller now asks `resolveCompensation`, and the resolver **refuses to
guess** — a carrier with no advance option resolves to nothing and says so,
rather than falling back to a hard-coded 70 or 75 percent.

**Production was dated by insertion, not by writing.** An import run in August
stamped `posted_at = now()`, so a book written in March counted as August
production and the leaderboard disagreed with the book of business underneath
it. `production_date` is now the basis, backfilled, with
`policy_counts_as_production(text)` as the single status test.

### Tests and results

- `compensation-check` — the ladder, the advance terms, and the refusal to
  guess. Pass.
- `production-source-check` — 110 assertions. Pass.
- `leaderboard-check`, `post-deal-compensation-check`,
  `contract-compensation-check` — pass.
- Scratch Postgres, migration applied twice, with an imported policy landing in
  the month it was written and a withdrawn one excluded from the same window.

**One defect the tests caught that reading did not.** `production_date` was
first given `default now()`. A column default is applied *before* a `BEFORE
INSERT` trigger, so the trigger's null test was permanently false and it never
fired. The default was removed and explicitly dropped.

### Acceptance by hand

1. Post a deal for a carrier with no advance option chosen → the form says the
   commission cannot be resolved and names why. It does not invent a number.
2. Import a book written in March, in August → it appears under March on the
   dashboard, the leaderboard and the book of business, all three agreeing.
3. Post a deal, then withdraw it → it leaves the production figure everywhere.

### Remaining risk

`get_carrier_breakdown` and four sibling RPCs moved onto `production_date` in
#159 but the migration (`20260815030000`) is **not yet applied**. Until it is,
Reports answers on `posted_at` while the dashboard answers on `production_date`
— the exact disagreement M1 set out to end, still live on one screen.

### Next

M2.

---

## M2 — A policy remembers, and a client has one story

**PR** #145

### Files and migrations

| | |
|---|---|
| Added | `src/lib/timeline/` (pure event merge), `policy_events` writers |
| Changed | client detail, policy detail |
| Migrations | none new; `policy_events` already existed and was unused |
| Checks | `timeline-check` |

### Root cause

A client's history was spread across four tables and rendered by three
components that each sorted differently, so the same client read differently
depending on where you opened them. `policy_events` had been created and never
written to.

### Tests and results

`timeline-check` — ordering, merging of same-instant events, and that a policy
event and a contact event on the same day interleave rather than grouping by
source. Pass.

### Acceptance by hand

Open a client with a policy that has changed status at least twice → one list,
newest first, with policy and contact events interleaved by time.

### Remaining risk

None known.

### Next

M3.

---

## M3 — Announcements and Discord say what they will do, and do it

**PRs** #138, #146, #156, #158, #159

### Files and migrations

| | |
|---|---|
| Added | `src/lib/announcements/lifecycle.ts`, `src/lib/discord/retry.ts`, `src/routes/api/public/hooks/dispatch-announcements.ts` |
| Changed | announcements route, Discord settings |
| Migrations | `20260814200000` *(applied)*, `20260815010000_announcement-lifecycle-and-targeting.sql` *(applied)*, `20260815020000_discord-named-integrations.sql` **(pending)** |
| Checks | `announcements-check`, `announcement-lifecycle-check` (76), `discord-channels-check`, `discord-health-check` (50) |

### Root causes

**`createAnnouncement` never set `organization_id`.** The org-isolation policy
requires it, so the insert was rejected for every agency owner — announcements
were broken in production. Worse, the read policy had an `organization_id IS
NULL` arm, so any row that *had* landed with a null org was visible to every
authenticated user in every agency. Both fixed; the null arm is gone and
existing rows are backfilled from the author's profile.

**A Discord webhook deleted in Discord returns 404 forever.** `last_error`
recorded the most recent failure; nothing counted them, so the product posted to
a dead webhook on every deal, indefinitely, while the owner saw a stale message
that never explained nothing had arrived for a fortnight. Now
`consecutive_failures` with a ladder (1 min → 5 → 30 → 2 hrs → 4 hrs, the last
repeating). A channel in backoff is **skipped, never disabled**: disabling needs
somebody to notice and switch it back on; skipping recovers by itself.

### Tests and results

- `announcement-lifecycle-check` — 76 assertions across draft/scheduled/
  published/expired, role and upline targeting. Pass.
- `discord-health-check` — 50 assertions across the ladder, backoff, health
  states and both patches. Pass.
- Scratch Postgres, both migrations applied twice, including the
  whitespace-label fallback and a refused negative failure count.

**Two defects found while building, both mine.** My dispatcher and the
publish-draft path both passed `normalizeChannels(["in_app"])`, so the two
channels that were the entire point never received anything. And I opened #157
duplicating a dispatch endpoint Lovable had already built correctly — closed it
and hardened theirs instead, which is where the `ANNOUNCEMENT_DISPATCH_TOKEN`
requirement came from.

### Acceptance by hand

1. Schedule an announcement for five minutes' time → it is invisible until then,
   then appears, and expires on its own.
2. Aim one at a role → somebody without that role does not see it.
3. Delete a Discord webhook in Discord, post a deal → the channel shows "Not
   delivering" with the usual cause named, and the delivery ledger shows a skip
   **with a reason**. Re-create the webhook → it recovers without being touched.

### Remaining risk

`20260815020000` is **pending**. Until applied, naming a Discord integration is
refused with a plain sentence and the rest of that edit still saves; the
delivery ledger drops the skip reason rather than the row.

`ANNOUNCEMENT_DISPATCH_TOKEN` must be set and the pg_cron job's `apikey` header
repointed at it. Until then the endpoint refuses every call — **fails closed**,
which is the right direction, but scheduled announcements will not dispatch.

### Next

M4.

---

## M4 — Every change to money, permission or hierarchy leaves a trail

**PRs** #148, #149, #151, #153, #154, #155

### Files and migrations

| | |
|---|---|
| Added | `src/lib/contracting/status.ts`, `trail.server.ts`, `history.ts` |
| Changed | contracting inbox, request detail, notification preferences |
| Migrations | applied with #148/#149 |
| Checks | `contract-trail-check` (43), `request-history-check` (50), `request-inbox-check` (35), `notify-prefs-check`, `comp-audit-check` |

### Root causes

**Money changed without a record.** A commission level, a contract status or a
carrier assignment could change with nothing written down. `recordContractChange`
now writes the audit row and the notification in one call, so the two cannot
drift apart.

**Notification preferences were read but not obeyed.** The settings screen wrote
them; the send paths did not consult them. Both consent layers are now checked
before every send.

**An agent could not see where their own request stood.** The inbox was
owner-only, and a decline gave no reason.

### Tests and results

- `contract-trail-check` (43), `request-history-check` (50),
  `request-inbox-check` (35), `notify-prefs-check` — all pass.

**One defect the tests caught.** `merge()` collapses duplicate history rows
within ten seconds and backdated to the earlier timestamp only when the *later*
row won. Rows arrive newest-first, so in the real case the richer row was
already kept and the earlier timestamp was discarded. Fixed to take `min` either
way.

### Acceptance by hand

1. Change an agent's commission level → the audit log names the old value, the
   new value, who changed it and when; the agent is notified.
2. Turn off a notification category → stop receiving it.
3. Decline a contract request without a reason → refused. With one → the agent
   sees the reason on their own request.

### Remaining risk

`contract_requests` and `contracting_requests` remain two tables. This is a
**deliberate two-layer design**, not an oversight — closed as such in #77 — but
it will keep reading like a duplicate to anybody new.

### Next

M5.

---

## M5 — Settings in six groups, and setup you can follow

**PR** #159

### Files and migrations

| | |
|---|---|
| Added | `src/lib/settings/groups.ts`, `contracting-checklist.ts`, `setup.functions.ts`, `src/components/settings/setup-checklist.tsx` |
| Changed | `src/lib/navigation.ts`, `settings.contracting.tsx`, `contracting-ops.functions.ts` |
| Migrations | none |
| Checks | `settings-setup-check` (47) |

### Root causes

**Nothing said which order to set things up in, or whether the result worked.**
Every screen existed and was reachable, so an owner could add three carriers,
never choose an advance option, and find out weeks later when a posted deal
earned nothing.

**And the worse one, found while building the checklist.** `OrgCarrierSchema`
did not list `default_advance_option`, `visible_to_agents`,
`requestable_by_agents`, `available_for_post_deal` or `enabled`. `z.object`
**strips unknown keys**, so every one was silently dropped on the way in — the
columns existed, the resolver read them, and nothing in the product could ever
write them. That is why the advance option "could not be chosen": not a missing
screen, a schema that threw the value away. A checklist telling an owner to fix
it would have been an instruction the product could not carry out.

### Tests and results

`settings-setup-check` — 47 assertions across the six groups, the six steps,
blocked-versus-todo, and that the problem lines are the resolver's own
sentences. Pass.

### Acceptance by hand

1. New agency, open Settings ▸ How Contracting Works → 0 of 6, pointed at
   carriers, later steps locked rather than linked.
2. Add a carrier, leave the advance option unchosen → the advances step names
   that carrier and says nothing is assumed on its behalf.
3. Set the advance option → it saves. (Before this PR it did not.)

### Remaining risk

None known.

### Next

Section 8.

---

## Section 8 — The rules the database was missing

**PR** #159

### Files and migrations

`20260815040000_integrity-constraints.sql` **(pending)**

### Root cause

The application assumed four rules the database did not enforce: one active
parent per agency, one rung per rank, a mapping's level and org agreeing, and a
profile's level and org agreeing. A child agency with two active parents would
have had its production counted under both.

### Tests and results

Scratch Postgres, applied twice, including that the backfill leaves ambiguous
rows alone.

The two cross-agency checks are `NOT VALID`, so applying this **cannot reject
rows already stored** — it stops new ones. `agency_level_review` queues
everything that cannot be resolved automatically; `agency_level_id` is
backfilled only where an agency has exactly one active rung and there is
nothing to choose between. Nothing is inferred from a percentage that happens to
match, because a rung decides what somebody is paid and a guess would quietly
put them on a level nobody chose.

### Remaining risk

Validating the two `NOT VALID` constraints against existing data is a
deliberate follow-up. Until then, pre-existing violations remain stored.

### Next

Section 9.

---

## Section 9 — Tests that would have caught this

**PRs** #152, #160

### Files

`scripts/integration-check.sh`, `eslint.config.js`,
`20260815050000_org-bound-admin-policies.sql` **(pending — apply first)**

### Root causes

**Lint did not finish.** `.vercel` and `.*.mjs` were being linted, so the run
never completed and nobody saw the errors underneath. Now it finishes with 0
errors.

**Every RLS policy was verified by reading it.** `scripts/integration-check.sh`
applies all 212 migrations to a scratch Postgres, seeds two unrelated agencies,
and reads as a real member of each under `authenticated` with policies enforced.

**And what that found.** `public.user_roles` is `(user_id, role)` — no
`organization_id`. So `has_role(auth.uid(), 'admin')` asks "is this person an
admin *anywhere*", and `admin`, `manager` and `agency_owner` are all issued
per-agency by ordinary product flows. **Fifty-two policies across thirty-three
tables** tested a role that way. Agency A's owner could read agency B's
`commission_schedule` — their per-agent commission rates — along with SSN access
logs, licensing state, import rosters, and the `producer-docs` storage bucket,
which holds government ID and voided cheques.

They escaped the org-scoping pass of 2026-07-30 because that pass dropped old
policies by a `<tbl>_owner_*` naming convention some tables never used, and
permissive policies **OR together** rather than override.

### Tests and results

`integration-check.sh` — cross-org isolation in both directions, owner roster
scope, signed-out reads nothing, no table with RLS on and zero policies, and a
structural rule that no policy may test an agency-level role without naming an
organization. Pass.

**The harness's own first version passed while the leak was live**, because the
users it seeded held no `user_roles` rows — and every leaking policy keys on
exactly that table. A test whose fixtures avoid the condition the bug needs is
not a test. Adding the four role rows the product actually issues made it fail
on `commission_schedule` immediately, and that failure is what the migration was
written from. Verified both ways: remove the migration and the harness fails
naming the leak.

Three further defects in the harness itself: it ran `psql` without
`ON_ERROR_STOP`, so its header's claim that a failing migration is a finding was
not true; a leftover postmaster made a re-run fail for reasons unrelated to the
schema; and the eleven migrations that genuinely cannot apply to an empty
database in filename order — all artefacts of backdated filenames, all applied
exactly once in working order in production — are now listed with their causes
rather than tolerated silently.

### Acceptance by hand

Sign in as the owner of one agency and open anything that lists commissions,
SSN access, imports or producer documents → nothing from any other agency
appears. Sign in as the other agency's owner → all of their own still does.

### Remaining risk

**The leak is open until `20260815050000` is applied.** Nothing breaks either
way; the cost of waiting is exposure.

Two things the audit could not settle from the migrations alone, each answerable
with one query against production:

- `select role, count(*) from user_roles group by 1` — how many accounts hold
  `admin`, which sets the blast radius of the findings that keyed on it alone.
- `select count(*) from commission_grids where organization_id is null and source <> 'seed'`
  — the NULL-org tier is a deliberate defaults tier and agencies cannot create
  rows in it, but a grid inserted over service role without an org would be
  world-readable.

Two **too-tight** findings, deliberately not fixed here because they restrict
rather than expose, and fixing them alongside a leak closure would muddle a
security change with a behaviour change:

- `client_health` — owning agent only, while its siblings `client_banking` and
  `client_financials` allow the upline and org owner. An owner can see a
  client's bank details but not their health record.
- `organization_memberships` — keyed on the literal `organizations.owner_id`, so
  an org admin who is not the owner cannot enumerate members.

One **too-loose-within-an-agency** finding, also left: `profiles` carries
`ssn_encrypted`, `ssn_last4` and `date_of_birth`, and `same_org(id)` lets any
colleague read them. The structural fix is to move those columns to a table with
an owner-plus-contracting-staff policy, the way `producer_regulatory_actions`
already does. That is a schema change with a data migration, not a policy edit.

### Next

Apply the four pending migrations, `20260815050000` first.
