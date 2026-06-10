---
name: Role gates must be additive
description: When introducing new role values, never remove recognition of existing roles from priority lists, isAdmin/isManager checks, or server require* helpers
type: constraint
---

When adding new values to the `app_role` enum (e.g. `super_admin`, `agency_owner`), they must be ADDED to:
- `ROLE_PRIORITY` in `src/hooks/use-role.ts`
- `isAdmin` / `isManager` / `isAgencyOwner` derived booleans
- `requireAdmin` / `requireAgencyOwnerOrAbove` / `requireManagerOrAdmin` server helpers
- Any `beforeLoad` `.in("role", [...])` route guards (e.g. `src/routes/admin.tsx`)

**Never remove existing role names** from those lists when adding new ones. The legacy `"admin"` role MUST remain recognized — Samuel (info@kingofsales.net) and Kaeden (kjvaughns13@gmail.com) both have a single `user_roles` row with `role='admin'`, and the unique constraint on `user_roles.user_id` (one role per user) means we cannot stack `super_admin` on top of it without an UPDATE that risks breaking DB functions like `has_role(uid, 'admin')` used in RLS and `get_team_downline_for`.

**Why:** Dropping `"admin"` from the hook's priority list resolved both real admins down to `"agent"`, hid the Admin Portal sidebar link, and 403'd every admin server fn. Happened twice.

**How to apply:** Treat the role enum as append-only in code. If you ever want to deprecate a role value, do it as a separate explicit migration (rename rows + update DB function references + update RLS policies in one coordinated pass), never silently by omission from a priority list.
