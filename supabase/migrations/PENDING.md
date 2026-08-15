# Migrations not yet applied

Migrations are applied by hand in Lovable, so a migration can sit in this
repository for hours or days before the database has it. Code deployed in that
window must still work — see `scripts/migration-safety.ts`, which reads this
file.

**This list is a fallback.** When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are set, the script asks `list_applied_migrations` instead and ignores this
file entirely, because a hand-maintained list going stale is the same kind of
mistake it exists to prevent. Keep it current anyway, for anyone running
without credentials.

Delete a line once the migration is applied.

_Nothing pending._

- `20260815020000_discord-named-integrations.sql`

`20260815020000` gives each connected Discord channel a `name` and lets a
failing one back off instead of being hammered.

An agency can already connect several channels with their own event toggles.
What was missing: nothing counted repeated failure, so a webhook deleted in
Discord returned 404 forever while the product kept posting to it on every
deal — one doomed request per deal per channel, indefinitely, with the owner
seeing a stale `last_error` that never explained nothing had arrived for a
fortnight. And nothing said what an integration was *for*: `channel_label`
answers "which Discord channel", so an agency posting deals and new agents to
the same channel through two integrations saw two identical rows.

Adds `name` (backfilled from `channel_label`, falling back to "Discord
channel"), `consecutive_failures`, `next_retry_at`, and three columns on
`discord_deliveries` so a skip can say why it was skipped. A channel in backoff
is skipped rather than disabled: disabling needs somebody to notice and switch
it back on, while skipping recovers by itself the moment the webhook works
again, and the ledger still records the gap.

Nothing is dropped. Every existing channel keeps every value it has and starts
at zero failures with no backoff, which is exactly its behaviour today.

Proven on scratch Postgres, applied twice, including that a blank
`channel_label` falls back rather than becoming a blank name, and that a
negative failure count is refused.

In the window: connecting and editing channels keeps working. Naming one is
refused with a plain sentence rather than a relayed "column does not exist",
and the rest of that edit still saves. The delivery ledger drops the skip
reason rather than the row, so a send is still recorded. `shouldAttempt` reads
`next_retry_at` off a row that does not have it yet and returns true, which is
today's behaviour: every enabled channel is tried every time.

- `20260815030000_analytics-production-source.sql`

`20260815030000` moves the five analytics functions onto the same production
rule the dashboard uses: `get_carrier_breakdown`, `get_agent_analytics`,
`get_team_leaderboard`, `get_analytics_overview`, `get_trends_12mo`.

They are what the Reports page is built from, so an owner could read one figure
on the dashboard and a different one on the screen named "how the agency is
doing" — from the same policies. Both halves were wrong for the same reasons
the dashboard's were: windowed on `posted_at`, so an imported book read zero
for the months it was written in, and no status filter at all, so withdrawn and
not-taken premium counted as production.

Each body was taken verbatim from its most recent definition and transformed
mechanically — fourteen `posted_at >= A AND posted_at < B` pairs became the
same pairs on `production_date` plus `policy_counts_as_production(status)`.
Nothing else in any body was touched. The activity feed's `pol.posted_at AS at`
is deliberately unchanged: that is a timestamp being displayed, not a window.

Behaviour only. No table, column, index or policy changes, and every statement
is a `create or replace`, so a rollback is re-running the migration that
defined it before.

Proven on scratch Postgres, applied twice, with an imported policy landing in
the month it was written and a withdrawn one excluded from the same window.

In the window: these functions keep their current definitions and keep
answering as they do today — which is the disagreement this fixes, so Reports
stays inconsistent with the dashboard until it is applied. Nothing breaks. The
TypeScript half of this change is already correct on its own, because
`selectProduction` falls back to `posted_at` when the column is missing.

- `20260815040000_integrity-constraints.sql`

`20260815040000` tells the database the rules the application already assumes,
and opens a review queue for the one thing it refuses to guess.

Four constraints, each turning a class of silently-wrong state into a refused
write: two active rungs cannot share a non-zero rank order; a level-carrier
mapping cannot point at another agency's rung; an agent cannot sit on another
agency's rung; and a child agency cannot have two active parents, which would
have counted its production under both.

Checked first and deliberately not re-added, because they already exist:
`base_pct` 0–500, `sort_order >= 0`, the `advance_option` enum, the
`agent_commission_levels.status` check, and the parent/child uniqueness on
`agency_relationships`. Also checked: `20260813232512` is not a conflicting
duplicate of `20260813220000` — it re-runs the same `create table if not
exists` and then drops and recreates the four policies with `to authenticated`
added, so the later definition is the correct one and there is nothing to
consolidate.

The two cross-agency checks are added NOT VALID, so applying this cannot
reject rows already stored; it stops new ones. Validating them against existing
data is a deliberate follow-up rather than something that could fail a
migration halfway through.

`agency_level_review` is the queue. `agency_level_id` is backfilled only for
the unambiguous case — an agency with exactly one active rung, where there is
nothing to choose between — and everybody else is listed for a person to
decide, with the candidate rungs spelled out. Nothing is inferred from a
percentage that happens to match: an agent's rung decides what they are paid,
and a guess would quietly put somebody on a level nobody chose. Terminated
agents are not queued.

In the window: nothing reads `agency_level_review` yet, and no constraint
exists to be violated, so the product behaves exactly as it does today.

- `20260815050000_org-bound-admin-policies.sql`

**Apply this one first.** It closes a cross-tenant read leak that is live in
production right now.

`public.user_roles` is `(user_id, role)` and has no `organization_id`. So
`has_role(auth.uid(), 'admin')` asks "is this person an admin *anywhere*" —
and `admin`, `manager` and `agency_owner` are all issued per-agency by
ordinary product flows (`billing.functions.ts` gives `agency_owner` to every
self-serve workspace creator). Fifty-two policies across thirty-three tables
tested a role that way, so any agency owner could read the other agencies'
rows.

Proven rather than inferred. On a scratch Postgres with every migration
applied and two unrelated agencies seeded, agency A's owner read agency B's
`commission_schedule` — their per-agent commission rates — while correctly
reading zero policies and zero clients from the same session. That second half
is what rules out a broken fixture: the org-scoping pass of 2026-07-30 worked,
and these policies escaped it because its drop-list assumed a `<tbl>_owner_*`
naming convention that some tables never used.

Three of the fixes are plain `DROP POLICY`: `commission_schedule` and
`onboarding_documents` already carry correct `*_org_select` / `*_org_modify`
policies, so the leaking ones were pure surplus and removing them takes nothing
from anybody. The rest swap the unbounded role test for `is_admin_of_agent()`,
a new helper built on the existing `is_org_admin()` — which already requires an
active membership in that specific org, so the bound comes from the schema's
own vocabulary rather than a new rule.

Also closed: the `producer-docs`, `agent-documents` and `imports` storage
buckets, where object paths are `<agent uuid>/<file>` and the same role test
let one agency list another's folders. That bucket holds government ID, voided
cheques and SSN-bearing contracting paperwork.

`super_admin` is untouched everywhere — it is the one role in that table that
really is platform-wide, and `is_platform_admin()` tests exactly it.

In the window: **the leak stays open until this is applied.** Nothing in the
product breaks either way — no TypeScript reads or writes any of these policies
directly, and every legitimate access path is preserved by the replacement. The
cost of waiting is exposure, not breakage.

Guarded from here on by `scripts/integration-check.sh`, which fails on the
leak itself and, separately, on any future policy that tests an agency-level
role without naming an organization.
