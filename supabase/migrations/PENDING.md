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

- `20260815090000_carrier-archived-status.sql`

Lets a carrier be archived. `org_carriers.status` allowed active, paused,
not_contracted and terminated, and none of them means "we are done with this
carrier, keep the history".

Reusing `terminated` would have been wrong in a way that shows up in paperwork:
terminated records that the CARRIER ended the relationship, which is a fact
about them, while archived is the agency's own filing decision.

An archived carrier keeps every policy, commission row and request it has, stops
appearing to agents, cannot be picked for new deals or requests, and can be
restored. Deleting is only offered when nothing points at it at all.

The old CHECK was created twice under different generated names, so it is found
by what it constrains rather than by a name this migration would have to guess.

Nothing is archived by applying this; it only makes the state expressible.

In the window: the Remove button on the Carriers tab archives via a status the
database refuses, so removal fails with a constraint error until this is
applied. Everything else on that tab works, including the statuses, search,
filter and counts.
