# Clean slate: remove Samuel's account and all production data

## What gets removed

**1. Samuel James (info@kingofsales.net) — account deleted entirely**
- Login removed, profile removed, plus everything hanging off it: his 13 contract requests, commission levels, org membership, roles, notifications, onboarding state, producer profile records.
- His 312 commission rows (upline credit on Kaeden's deals) go away with the deals below.
- Your profile's upline pointer clears automatically, so nothing breaks on your side.

**2. All production / book-of-business data across both organizations (APEX Financial and Vantage Financial)**
- 256 clients and everything attached to them: beneficiaries, financials, banking, needs analyses, life events, contact history, dial list entries.
- All 80 policies.
- All 727 commission rows.
- Commission statements and statement lines, retention cases, policy review records, import jobs and import proposals, pipeline/contact history, calendar events tied to deleted clients, Nova activity tied to deleted clients.

**3. What stays untouched**
- Your account (kjvaughns13@gmail.com), roles, and super admin access.
- Both organizations, agency branding, agency levels, carriers, commission grids, contracting settings, writing numbers, academy/handbook/scripts content, and all app configuration.

After the wipe: Dashboard, Pipeline, Book of Business, and Finances all show clean empty states, and any new deal posted or imported gets commissions calculated fresh.

## Technical notes

- Data-only work. No schema changes; done through the data tool with explicit `DELETE` statements, in child-before-parent order where foreign keys are not cascading.
- Client deletes cascade to policies, which cascade to `commission_schedule`, `commission_backfill_queue`, and `retention_cases`. Nullable references (`commission_statement_lines.policy_id`, `discord_deliveries.policy_id`) are cleared first so nothing is orphaned.
- Samuel's login is removed via the auth admin API, which cascades his `profiles` row; `profiles.upline_id` is `ON DELETE SET NULL`, so your row survives with a null upline.
- After deleting, run count checks on `clients`, `policies`, `commission_schedule`, and `profiles` to confirm zero rows remain and only the expected profiles are left.

## Warning

This is permanent and there is no undo. All 80 policies and 256 clients are gone, including anything that was real production data rather than demo/sample rows.
