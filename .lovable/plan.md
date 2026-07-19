## What I found

Recent commits (monetization, roles, carrier sync, dashboard real-data, Nova AI hub, premium landing/auth) shipped code but their migrations were never run against the database. Frontend calls tables/columns that don't exist yet, so every one of these features silently fails at runtime.

**Missing in DB (code already references them):**
- `role_permissions` + audit table (used by `permissions.functions.ts`, `agency.team.tsx`, sidebar access hook)
- `carrier_sync_logs` + `policies.last_synced_at` / `sync_source` (used by `carrier-sync.functions.ts`, `/carrier-sync` page)
- Monetization columns on `organizations` (`stripe_customer_id`, `plan_type`, `nova_seats_purchased`, `subscription_status`, `nova_partner_commission_*`, etc.) and `profiles` (`nova_pro_status`, `stripe_customer_id`, `nova_usage_*`, `nova_pro_phone_number`, etc.) — used across `billing.functions.ts`, `settings/billing`, `settings/nova-pro`, `admin/subscriptions`, Stripe webhook
- Updated `get_dashboard_metrics` function from the dashboard-real-data migration

**Logo:** the only brand asset in the repo is `public/favicon.jpg`. Sidebar, landing hero/footer, and the login side-panel all render the lucide `<Cloud />` icon as a placeholder instead. That's why "the logo is gone" in those spots.

## Plan

### 1. Apply the four missing migrations (one consolidated migration)
Re-run the SQL that shipped in these files, guarded with `IF NOT EXISTS` so it's idempotent against any partial state:
- `20260715120000_dashboard-real-data.sql` — `get_dashboard_metrics` rewrite
- `20260716100000_carrier-book-sync.sql` — `carrier_sync_logs`, `policies.last_synced_at/sync_source`, RLS + GRANTs
- `20260716120000_monetization.sql` — organization/profile billing columns, plan_type check, Nova Pro fields
- `20260717100000_role-permissions.sql` — `role_permissions` + audit log + GRANTs + RLS

Delivered as one new migration `20260719_apply_missing_features.sql` (safe re-run of everything).

### 2. Brand logo everywhere it belongs
- Add a real logo asset at `src/assets/agent-cloud-logo.png` (import + use as `<img>` — sourced from existing `public/favicon.jpg` copied over, so no new artwork required).
- Replace `<Cloud className="…"/>` placeholder in:
  - `src/components/app-sidebar.tsx` fallback (when no org logo)
  - `src/routes/index.tsx` nav + footer
  - `src/routes/login.tsx` side panel and inline mark
  - `src/routes/signup.tsx` / auth shell
  - Email templates that render an inline brand mark
- Keep the org logo override behaviour intact — agencies with a custom `logo_url` still take precedence in the sidebar.

### 3. Wire missing UI to real backend + polish
- **Billing (`/settings/billing`, `/settings/nova-pro`, `/admin/subscriptions`)**: verify all reads now succeed with the new columns; hide plan-switch UI unless `stripe_customer_id` is set; show empty-state instead of a runtime error when a workspace has no subscription yet.
- **Team & Permissions (`/agency/team`)**: load actual `role_permissions` rows and surface the "save permissions" audit trail; add loading/empty states.
- **Carrier Sync (`/carrier-sync`)**: show real `carrier_sync_logs` history table + last synced timestamp on policies; gate the upload button by `has_role(admin) OR agency_owner`.
- **Dashboard**: nothing to change component-side — the SQL fix restores correct team vs personal splits and status-grid/donut ranges.
- **Sidebar `useMyAccess`**: fall through cleanly when `role_permissions` is empty (default deny for staff, full for admin/agency_owner) so nav doesn't flicker.

### 4. Cross-cutting polish
- Consistent page header (title + subtitle + primary action) on all four new pages using the existing `PageShell` / `HeroBand` from `page-shell.tsx`.
- Gold `--primary` tokens (per project memory) on the new Nova Pro / billing status pills — no hardcoded blue/purple.
- Update `__root.tsx` favicon link to reference the new PNG logo alongside the existing `favicon.jpg`.

### Out of scope (say so up front)
- No new features. No redesign of the pages themselves — just making them functional and on-brand.
- Not touching Stripe keys/config — user already set those up in an earlier turn.

### Technical notes
- Every `CREATE TABLE` in the consolidated migration includes explicit `GRANT` to `authenticated` + `service_role` and `ENABLE ROW LEVEL SECURITY` before policies (per project rules).
- `role_permissions` and `carrier_sync_logs` remain auth-only (no `anon` grant).
- `get_dashboard_metrics` re-created with `SECURITY DEFINER` + fixed `search_path`.
- All column adds use `IF NOT EXISTS`; policy creates use `DROP POLICY IF EXISTS` first — safe to run against a drifted remote.

Approve and I'll ship it in one pass: migration → logo swap → UI wiring.