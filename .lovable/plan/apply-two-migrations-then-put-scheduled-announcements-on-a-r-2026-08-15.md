# Apply two migrations, then put scheduled announcements on a real clock

## Part 1 — Apply the migrations, verbatim, in order

1. `20260814250000_production-date.sql` — production_date column, backfill, BEFORE INSERT trigger, three indexes, `policy_counts_as_production(text)`, replaced `get_dashboard_metrics`. No column default (deliberate).
2. `20260815010000_announcement-lifecycle-and-targeting.sql` — status / publish_at / expires_at / target_roles / target_upline_id, three CHECK constraints, two indexes, replaced `announcements_read` policy.

Each file is passed through byte-for-byte, no edits, no splitting.

After applying:
- Confirm PostgREST reloaded and now sees the new columns.
- Regenerate `src/integrations/supabase/types.ts`.
- Remove the two entries from `supabase/migrations/PENDING.md`, keeping its header intact.

Then run the four verification queries from the request and report the actual counts and constraint names back — nulls, imports moved back, forward-dated sales kept, and the three announcement CHECK constraints.

Nothing is reset, dropped, or deleted.

## Part 2 — Deliver scheduled announcements without a visitor

Visibility is already derived by the RLS policy, so the in-app feed needs nothing. Only email and Discord need something to reach out, and today that only happens when an owner opens the page.

The existing `deliver()` in `src/lib/announcements.functions.ts` stays the one and only delivery implementation — no second copy, no Edge Function, no "sent" flag on `announcements`. Idempotency is left entirely to `announcement_deliveries` plus the `announcement:<id>:<profileId>` email key.

What gets added:

1. **An all-orgs sweep next to the existing code.** A plain exported async function in `announcements.functions.ts` that does exactly what `dispatchDueAnnouncements` does today, but iterates every organization with `status = 'scheduled'` rows instead of one owner's org, and calls the same `deliver()` and the same `dueForDispatch()`. The existing owner-triggered server function keeps working unchanged.
2. **A cron endpoint** at `src/routes/api/public/hooks/dispatch-announcements.ts`, same shape as the existing `run-automations` hook: POST only, rejects unless the caller presents the shared token in a header, then dynamically imports the sweep and returns a JSON summary. No PII in the response.
3. **A shared token in vault**, following `20260611022622_email_infra.sql:285` — a vault secret for this job, created/updated idempotently.
4. **A pg_cron job `dispatch-due-announcements`**, `*/5 * * * *`, calling the endpoint on the stable project URL via `net.http_post` with the token header, reading the token from vault. Applied as data (project-specific URL and secret), not as a repo migration.

## Test run and report

Schedule one announcement two minutes out with email and Discord enabled, wait for the job, then show the `announcement_deliveries` rows it produced (channel, status, target), plus the job name, schedule, and `SELECT cron.unschedule('dispatch-due-announcements')` as the off switch.

## Technical notes

- `pg_cron` and `pg_net` are already in use by the email queue; the new job reuses them.
- The endpoint lives under `/api/public/*` because that prefix bypasses site auth for external callers, so the handler authenticates itself.
- Because there is no user session in the cron path, the sweep iterates organizations explicitly and uses the admin client, exactly as the automations sweep does.
