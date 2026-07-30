## What I verified

- Every named migration through `20260727100000_grid-uploads-and-intake.sql` is live (checked the actual tables: `client_banking`, `demo_requests`, `commission_grid_uploads`, `document_intake`, plus `organization_settings.emails_enabled` / `email_categories` and `email_send_log.send_key` from the email work).
- **Two migrations are not applied:**
  - `20260729100000_discord-integration.sql` → `discord_integrations`, `discord_deliveries` — both missing from the database.
  - `20260730100000_white-label-applications.sql` → `white_label_applications` + touch trigger — missing.
- `src/lib/discord.functions.ts` and `src/lib/white-label.functions.ts` already query those tables, so both features currently fail at runtime.
- Both files also **lack `GRANT` statements**, so even after running them the Data API would return permission errors.

## Plan

1. Run one migration containing both pending files' contents, in order:
   - Discord: `discord_integrations` (org-scoped, owner-only read of the webhook URL), `discord_deliveries` with the once-per-policy unique index, RLS enabled and the owner/read policies.
   - White Label: `white_label_applications` with its status check, one-open-application unique index, status index, read/insert/update policies and the `touch_white_label_application` updated_at trigger.
2. Add the missing grants for each new table (`authenticated` for the policy-covered operations, `service_role` for the server-side send/admin paths, no `anon` — every policy is org/owner scoped).
3. After it applies, regenerate types and typecheck, then confirm the Discord settings panel and the White Label application flow read/write against real tables.

## Not included

`20260728100000_owner-consolidation.sql` is still unapplied on purpose — its section 4 deletes `info@kingofsales.net` and reassigns that account's clients, policies and commissions. Your owner access was already granted directly, so nothing needs it. Say the word if you want the data-move sections (1–3) run without the deletion.
