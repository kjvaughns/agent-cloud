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

**Put the filename alone on its bullet line.** `migration-safety.ts` strips the
`- ` and the backticks and then requires the line to end in `.sql`, so an entry
with its description on the same line is invisible to the script — which is the
exact failure the script exists to prevent. Prose goes in the indented
paragraphs below.

- `20260818140000_org-membership-from-upline.sql`

  Derives an agent's agency by walking `upline_id` when their
  `organization_memberships` row is missing and `profiles.organization_id` is
  null, backfills both, widens `my_org_ids()` with the same revocation-guarded
  fallback the application already uses, moves `agency_levels_read` onto it, and
  adds a trigger so a new recruit inherits their upline's agency.

  **This one is the fix, not a refinement.** Until it is applied, an agent in
  that state sees no carriers (`org_carriers_read` gates on `my_org_ids()`), no
  positions to assign to their own downline and no level names
  (`agency_levels_read` gated on the denormalised copy), and their posted deals
  reach no Discord channel (`getMyOrgIds` finds neither, so `announceDeal`
  records `no_organization` and stops). One missing row, three unrelated-looking
  reports.

  The application changes that ship with it are safe on their own: the honest
  refusal when an upline has no position of their own, and closing the
  revocation hole in `getMyOrgIds`, both work against today's schema.

  Verified on a scratch Postgres seeded with the exact deadlock — an owner, an
  upline and a sub-agent with neither a membership row nor a copy, a terminated
  profile, and an archived membership with a stale copy — applied twice. Both
  agents gain the ladder, the carriers and their membership rows; a new recruit
  under them gets both automatically; somebody with no upline is left alone; a
  cycle returns instead of hanging; and neither the terminated profile nor the
  archived membership is readmitted.

  Forward only. No column is dropped, no row deleted, and every write is
  conditional on the value being absent.

- `20260818160000_agency-api-keys.sql`

  Adds `api_keys` and `api_key_usage`, both owner-only under RLS, for the
  read-only production API an agency owner issues to somebody outside the
  agency — typically their upline, for their own website.

  **The feature is inert until this is applied**, rather than broken: the
  settings panel's key list throws on a missing table and the endpoints answer
  401 to every call, because there is no key to match. Nothing else in the
  product reads these tables.

  Verified on a scratch Postgres, applied twice: an owner sees their own
  agency's keys and only those, an agent in the same agency sees none and
  cannot mint one, another agency's owner sees only theirs, the same key hash
  cannot be registered to two agencies, and usage history survives revocation.

  Forward only. Two new tables; nothing existing is altered, dropped or
  deleted.

- `20260818120000_org-leaderboard.sql`

  Adds `get_org_leaderboard(_start, _end)`, a security definer function
  returning one row per agent who produced in the window, for every agent in
  the caller's agency; and `policy_is_placed(text)` beside the existing
  `policy_counts_as_production(text)`.

  **The leaderboard works without this.** `getLeaderboardData` calls the
  function and, on any error, logs a warning and falls through to the existing
  downline path. Nobody sees an error or an empty board.

  What is still wrong until it is applied: the My Agency board keeps meaning
  "my downline" for anyone who is not an org admin — which is the bug the
  migration exists to fix — because `scope_agent_ids` degrades `'agency'` to
  `'team'` for them.

  Verified on a scratch Postgres seeded with an agency containing an agent whose
  `profiles.organization_id` copy is null, an agent with no membership row, a
  zero producer, a terminated profile and a second agency; applied twice. Every
  producer appears for a non-owner caller, the other agency never does, the
  terminated profile reads nothing, and the inclusive window end keeps the last
  day of the period.

  Forward only. It creates and replaces two functions; no table is altered, no
  column dropped and no row deleted. Re-running it is a no-op.
