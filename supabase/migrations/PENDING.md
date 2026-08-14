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

- `20260814250000_production-date.sql`

`20260814250000` gives every policy a `production_date` — the date every
production figure in the product windows on — and repairs the reported bug
where the leaderboard showed zero for a month in which the book of business
plainly contained business.

Production was windowed on `posted_at`. That is exactly right for a deal an
agent posts through the product and nonsense for an imported one: two of the
import paths stamp `posted_at = now()`, so an agency importing four hundred
policies written over three years got four hundred policies dated the
afternoon of the import. Every one of those months read zero while the book of
business, which has no date window at all, listed them correctly the whole
time. The rule is `effective_date` when it precedes `posted_at`, `posted_at`
otherwise — so it only ever moves a date backwards, and cannot reintroduce the
forward-dated-sale bug fixed in #144.

It also adds `policy_counts_as_production(text)`, replaces
`get_dashboard_metrics` so the dashboard windows on the same column and skips
the same statuses as everything else, and adds a BEFORE INSERT trigger so the
next import is dated correctly without any import path having to know the rule.
The pipeline status grid and the donut deliberately keep counting every status,
including withdrawn — those are pipeline views, not production figures.

Nothing is dropped and `posted_at` keeps every value it has: this adds a column
beside it rather than rewriting it, so the raw fact of when a row was entered
survives.

In the window: no production read names the column, in a projection or a
filter. Every one goes through `selectProduction` in
`src/lib/production/source.server.ts`, which runs the query against
`production_date` and, on a 42703, runs it again against `posted_at` — today's
behaviour exactly. The roster reads `select("*")` and windows in TypeScript,
where `productionDate()` already falls back. So the pending window is not a
degraded product, it is the current product; what it is *not* is the fix, and
imported books keep reading zero for their own months until this applies.
