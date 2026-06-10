## Problem

`src/hooks/use-role.ts` was refactored to a new role taxonomy (`super_admin`, `agency_owner`, `manager`, `agent`, `staff`), but the database `app_role` enum still only contains `agent | manager | admin`. Every existing admin row in `user_roles` has `role = 'admin'`, which the new hook doesn't map to anything — so `isAdmin` and `isAgencyOwner` both return `false`, and the Admin Portal button hides for you and the agency owners.

Confirmed via DB: `info@kingofsales.net` and `kjvaughns13@gmail.com` both have `role = 'admin'`.

## Fix (frontend only, one file)

Update `src/hooks/use-role.ts`:

1. Add `"admin"` to the `AppRole` union and to `ROLE_PRIORITY` (treated as equivalent to `agency_owner` for gating).
2. Make `isAdmin` / `isAgencyOwner` / `isManager` also return `true` when `role === "admin"`.
3. Keep `canInviteAgencyOwner` etc. consistent so legacy admins keep their existing capabilities.

No DB migration, no other component changes — every existing call site (`top-bar.tsx`, `app-sidebar.tsx`, etc.) already reads `isAdmin` / `isManager` and will start showing the Admin Portal button again immediately.

## Out of scope

- Migrating the enum to the new taxonomy (`super_admin`, `agency_owner`, `staff`). That's a larger change touching the enum, RLS policies, and `has_role`; not needed to restore the button. Happy to do it as a follow-up if you want the new roles to actually exist in the DB.
