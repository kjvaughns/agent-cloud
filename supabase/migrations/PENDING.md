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

- `20260815010000_announcement-lifecycle-and-targeting.sql`

`20260815010000` gives an announcement a life beyond "posted, and visible to
everybody forever". It adds `status` (draft / scheduled / published),
`publish_at`, `expires_at`, `target_roles` and `target_upline_id`, and
replaces `announcements_read` so the feed honours all five.

Whether a post is visible *right now* is derived from those columns on every
read, never stored. That is deliberate: a stored status is wrong for as long as
whatever updates it is down, and there is no scheduler this repository can
create — the one pg_cron job the product uses is applied through the Supabase
Management API by an external tool and calls an Edge Function that does not
live here. Deriving it means a scheduled announcement appears on time because
time passed, and an expired one drops out for the same reason.

Nothing is dropped. Every existing announcement defaults to `published` with
an empty role list and no upline, which is exactly what it is today. The author
and the agency owner keep seeing everything at every stage, including expired
posts — taking one down is an expiry, never a delete, because a delete destroys
the only record that the message ever went out.

Proven on scratch Postgres, applied twice, with the read policy asserted from
four seats: an agent inside a targeted team, the manager it is aimed through,
an unrelated agent, and the owner.

In the window: posting to the whole agency, now, keeps working exactly as it
does today — `createAnnouncement` retries without the new columns when
PostgREST reports them missing. Anything that actually needs them says so:
scheduling, expiry or targeting gets a plain refusal naming what is
unavailable, rather than silently publishing immediately to everybody, which
is the opposite of what was asked for and cannot be taken back. Reading the
feed is unaffected, and `dispatchDueAnnouncements` returns zero rather than
throwing.

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
