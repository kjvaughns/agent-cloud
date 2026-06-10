# Stop removing admin access

## The bug

My org/roles migration introduced `super_admin` and `agency_owner` and I rewrote `src/hooks/use-role.ts` to recognize only the new role names. Both Samuel (`info@kingofsales.net`) and Kaeden (`kjvaughns13@gmail.com`) have a single `user_roles` row with `role = 'admin'` (legacy). My new code does not recognize `"admin"` anywhere:

- `ROLE_PRIORITY` lists `super_admin, agency_owner, manager, agent, staff` — no `admin` → resolved role becomes `null` → falls through to `"agent"`.
- `isAdmin = role === "super_admin" || role === "agency_owner"` → `false` for any legacy `"admin"`.
- `requireAdmin` / `requireAgencyOwnerOrAbove` only accept the new names → server fns also 403.
- The org migration tried to insert `super_admin` rows for both admins but those rows are not in the DB (I will re-run that step in the SQL below to be safe).

The sidebar guard `(isAdmin || isManager) && …` then hides the Admin Portal link, and every `requireAdmin`-gated server fn rejects you. That is what you keep seeing.

## Fix — two coordinated changes

### 1. `src/hooks/use-role.ts` — accept legacy `"admin"` everywhere

```diff
-export type AppRole = "super_admin" | "agency_owner" | "manager" | "agent" | "staff";
-const ROLE_PRIORITY: AppRole[] = ["super_admin", "agency_owner", "manager", "agent", "staff"];
+export type AppRole = "super_admin" | "agency_owner" | "admin" | "manager" | "agent" | "staff";
+const ROLE_PRIORITY: AppRole[] = ["super_admin", "agency_owner", "admin", "manager", "agent", "staff"];

-  const isSuperAdmin  = role === "super_admin";
-  const isAgencyOwner = role === "agency_owner" || role === "super_admin";
-  const isManager     = role === "manager" || role === "agency_owner" || role === "super_admin";
-  const isAdmin       = role === "super_admin" || role === "agency_owner";
+  const isSuperAdmin  = role === "super_admin";
+  const isAgencyOwner = role === "agency_owner" || role === "super_admin";
+  const isAdmin       = role === "super_admin" || role === "agency_owner" || role === "admin";
+  const isManager     = role === "manager" || isAdmin;
```

And update the server helpers to include `"admin"`:

```diff
 export async function requireAgencyOwnerOrAbove(supabase, userId) {
-  .in("role", ["super_admin", "agency_owner"])
+  .in("role", ["super_admin", "agency_owner", "admin"])
 }
 export async function requireManagerOrAdmin(supabase, userId) {
-  .in("role", ["super_admin", "agency_owner", "manager"])
+  .in("role", ["super_admin", "agency_owner", "admin", "manager"])
 }
```

Treating legacy `"admin"` as equivalent to `"agency_owner"` for gate purposes is the safe semantic — it's how the app behaved before the org migration.

### 2. Migration — promote the two real admins to `super_admin` (idempotent)

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users
WHERE email IN ('info@kingofsales.net', 'kjvaughns13@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
```

This makes their `super_admin` capability explicit going forward (their existing `admin` row stays — `ROLE_PRIORITY` will simply pick the higher one). Without this, anyone reading the DB would still see them as only `admin`.

## Audit of every other place I might have broken admin gating

I will also check (read-only, fix any I find):
- `src/routes/admin.tsx` — guard query (`.in("role", ["admin", "manager"])`). Already accepts legacy `admin`, but I'll also include `super_admin`/`agency_owner` so new-style admins aren't locked out.
- `src/lib/admin.functions.ts` and other `*.functions.ts` files — every `requireAdmin` / `requireRole` call.
- `src/components/app-sidebar.tsx` and any other `isAdmin`/`isManager` UI gate — these consume the hook, so fix #1 covers them.
- Any RLS policy that checks `role = 'admin'` only.

## Verification

1. After the migration runs, `SELECT user_id, role FROM user_roles WHERE user_id IN (samuel, kaeden)` shows both `admin` AND `super_admin`.
2. Open `/admin` while signed in as Samuel — Admin Portal link visible, page loads.
3. Trigger one admin-only server fn (e.g. `adminAssignAllCarriers`) — no 401/403.
4. Sign in as a regular agent — Admin Portal link hidden, `/admin` redirects/blocks.

## Why this happened (so I don't do it again)

I treated the new role enum values as a replacement set instead of an extension. The right rule, captured as a memory: **adding a new role value never removes recognition of existing role values; gates must be additive, never replacements.** I'll save this to project memory in the same turn.

## Out of scope

- Renaming legacy `admin` rows to `super_admin` outright and dropping the enum value — too risky in one pass while RLS policies and other migrations may still reference `admin`. We can plan that cleanup separately once everything is verified.
