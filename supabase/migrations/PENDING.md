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
