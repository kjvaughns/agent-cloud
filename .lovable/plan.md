## Problem

After restoring the Admin Portal button, server functions still throw `Forbidden: admin role required`. Reason: `src/lib/admin.functions.ts` has its own local `requireAdmin` / `requireManagerOrAdmin` helpers that check for `super_admin` / `agency_owner` — roles that don't exist in the DB enum (`app_role = {agent, manager, admin}`). So every admin server fn rejects legitimate admins. The non-working admin pages are downstream of these RPC failures.

`src/lib/admin-import.functions.ts` already uses the correct values (`admin`, `manager`) so its endpoints work.

## Fix (frontend / server-fn only, no DB changes)

1. `src/lib/admin.functions.ts` — change the two local helpers to match the real enum:
   - `requireAdmin`: `.in("role", ["admin"])`
   - `requireManagerOrAdmin`: `.in("role", ["admin", "manager"])`

2. `src/hooks/use-role.ts` — align the exported helpers (used elsewhere) with the real enum so future callers behave the same:
   - `requireSuperAdmin` → check `["admin"]` (legacy admin is top-tier in current enum)
   - `requireAgencyOwnerOrAbove` / `requireAdmin` → `["admin"]`
   - `requireManagerOrAdmin` → `["admin", "manager"]`

No migration, no RLS changes. Once these land and you hard-refresh, the admin pages that depend on these server fns (agents list, hierarchy, contracts, commissions, settings, backfill, etc.) will load again.

## Out of scope

- Migrating the enum to the richer `super_admin / agency_owner / staff` taxonomy. Separate, larger change touching the enum, every RLS policy, and `has_role`. Can do as follow-up if you want those roles to actually exist.
