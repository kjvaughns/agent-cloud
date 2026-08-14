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

- `20260814210000_compensation-single-source.sql`

`20260814210000` gives the canonical compensation resolver the columns it
needs: the six agency-carrier controls (`enabled`, `visible_to_agents`,
`requestable_by_agents`, `available_for_post_deal`, `default_advance_option`),
an `advance_option` on level-carrier mappings and on agent contracts, a
`status` on `agent_commission_levels` so a contract can be history rather than
terms, and `commission_setup_issues` — the table that tells an agent why a
posted deal earned nothing instead of writing it to a server log nobody reads.

Nothing is dropped. `agent_commission_levels` keeps every row and column and
simply stops being the only place an answer can come from. Existing carriers
keep their current behaviour: the four boolean controls default to true, and
`default_advance_option` is deliberately left null because guessing an
agency's advance terms is the silent-default problem this exists to fix.

In the window: every read goes through `select("*")` and tolerates the columns
being absent, so the resolver treats an existing carrier as enabled and
visible (today's behaviour) and reports `no_advance_option` — which is honest,
because until an owner chooses one there is no advance to apply. Writing to
`commission_setup_issues` is caught and logged rather than thrown, so a
missing table cannot fail a posted deal.
