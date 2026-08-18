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
