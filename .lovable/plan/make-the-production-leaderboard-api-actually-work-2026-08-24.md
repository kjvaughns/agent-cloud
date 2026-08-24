# Make the production / leaderboard API actually work

## What's wrong

The API is fully built in code — key issuing, scopes, usage logging, `/api/v1/whoami`, `/api/v1/production`, and an API Keys panel already mounted in Settings → Agency. What's missing is the database: the `api_keys` and `api_key_usage` tables were never created.

Confirmed live against the published site:
- `GET /api/v1/production` with any key returns `500 server_error` (the key lookup hits a table that doesn't exist).
- The API Keys panel in Settings → Agency can't list or issue keys for the same reason.

## The fix

1. **Create the two missing tables** (with grants and row-level security):
   - `api_keys` — agency, name, key prefix, key hash, scopes, who created it, when it was last used, revoked at / revoked by.
   - `api_key_usage` — which key, which agency, which endpoint, response status, caller IP, timestamp. Used for the "calls in the last 30 days" figure the panel already shows.
   - Access limited to the owning agency; the public endpoints read them through the trusted server role.
   - Record `last_used_at` on each authenticated call so the panel's "last used" column is real.

2. **Add a leaderboard endpoint**: `GET /api/v1/leaderboard` — the same numbers as the dashboard leaderboard, ranked, one row per producer with rank, name, premium, policies and placed premium, plus agency totals. Requires the `producers:read` scope (names are involved); optional `start` / `end` and `limit`. Computed with the same shared tally used by the dashboard, so the API and the app can never disagree.

3. **Make the settings panel copy-ready**: after issuing a key, show the key once plus ready-to-copy request examples for the totals endpoint and the leaderboard endpoint, using the agency's own URL. A "test key" button that calls `whoami` so an owner sees it working before handing it out.

4. **Verify**: extend `scripts/api-keys-check.ts` and issue a real key, then call `whoami`, `production` and `leaderboard` against it end to end, confirming a revoked key is refused and a totals-only key can't read names.

## Note on wording

This is a read-only API (a URL someone else's site or a spreadsheet can pull from), not a webhook that pushes to you. If you also want Agent Cloud to *push* production events out to a URL you provide (Zapier, Make, a Discord/Slack relay), say so and I'll add outbound webhooks as a follow-up.

## Technical detail

- Migration: `public.api_keys` (`key_hash` unique, `key_prefix` indexed, `organization_id` FK, `revoked_at`), `public.api_key_usage` (indexed on `organization_id, created_at` and `api_key_id`), GRANTs for `authenticated` (owner reads via the existing owner guard) and `service_role`, RLS scoped to the caller's organization, `updated_at` trigger on `api_keys`.
- No change to `src/lib/api/keys.ts`, `authenticate.server.ts`, or `api/v1/production.ts` logic beyond adding `last_used_at` touch.
- New route `src/routes/api/v1/leaderboard.ts` reusing `selectProduction` + `tallyByAgent`, same CORS and rate-limit guard as `production.ts`.
