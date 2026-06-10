# Plan

## 1. Sidebar header typography
File: `src/components/app-sidebar.tsx` (header block, ~lines 140-165)

Current behavior: the org name (or "Agent Cloud" fallback) is rendered large in Bebas Neue, and "by APEX" is the tiny tagline below.

New behavior:
- **If the user has an organization (and it is not the apex/default Agent Cloud org):** render the **agency name** as the large display title (Bebas Neue, ~1.1rem, tracked), and render **"Agent Cloud"** as the small uppercase tagline underneath (replacing the current "by APEX" line). If `org.tagline` exists, prefer it over "Agent Cloud" for the small line.
- **If there is no agency (apex/default org or no org):** keep today's look — "Agent Cloud" as the big title, "by APEX" as the small line.

Detection: treat org as an "agency" when `org?.slug` exists and is not `"apex"` (apex is the default org per project memory).

No other files touched for this change. Brand gold tokens and logo logic stay as-is.

## 2. Promote info@kingofsales.com to agency_owner
Use the database migration tool to insert an `agency_owner` row into `public.user_roles` for the user whose `auth.users.email = 'info@kingofsales.com'`. Idempotent via `ON CONFLICT (user_id, role) DO NOTHING`. No-op if the user has not signed up yet (we'll surface that in the migration description so you know to have them sign in first).

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'agency_owner'::app_role
FROM auth.users
WHERE lower(email) = 'info@kingofsales.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

## Out of scope
- No changes to logo, gold tokens, or `styles.css`.
- No changes to role enum or role-gate helpers.
