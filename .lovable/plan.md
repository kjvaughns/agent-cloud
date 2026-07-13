# Rename Sophai → Nova (full sweep)

Rename the in-app AI assistant from "Sophai" to "Nova" everywhere: UI copy, routes/URLs, filenames, code identifiers, and database tables.

## Scope

### 1. Routes / files (rename on disk)
- `src/routes/_authenticated/sophai.tsx` → `nova.tsx`
- `src/routes/_authenticated/sophai/settings.tsx` → `nova/settings.tsx`
- `src/routes/_authenticated/sophai/activity.tsx` → `nova/activity.tsx`
- Update every `createFileRoute("/_authenticated/sophai...")` string to `/nova...`
- Let `src/routeTree.gen.ts` regenerate (do not hand-edit).

### 2. Code references
Update all imports, `<Link to="/sophai...">`, labels, and identifiers in:
- `src/routes/index.tsx` (landing copy)
- `src/components/pipeline/client-detail-drawer.tsx`
- `src/lib/ai-features.functions.ts` (function names / table refs)
- `src/routes/_authenticated/account/faq.tsx`, `account/help.tsx`
- `src/routes/_authenticated/phone.tsx`
- Sidebar entry + any icons/labels

Rename symbols: `SophaiSettings` → `NovaSettings`, `sophai_activity` refs → `nova_activity`, etc.

### 3. Database migration
- Rename tables: `sophai_activity` → `nova_activity`, `sophai_settings` → `nova_settings`
- Preserve RLS policies, grants, indexes, FKs (Postgres `ALTER TABLE ... RENAME` carries these)
- Regenerate `src/integrations/supabase/types.ts` (auto after migration approval)

### 4. User-facing copy
Every visible "Sophai" string becomes "Nova". Tagline/description stays functionally the same.

## Out of scope
- No logic changes, no new features, no design changes.
- Chat history / activity rows are preserved (table rename, not drop).

## Verification
- `rg -i sophai src/ supabase/` returns zero hits (except historical migration files, which stay untouched).
- `/nova`, `/nova/settings`, `/nova/activity` load; old `/sophai/*` URLs 404 (acceptable — internal app).
- Build passes; Nova settings & activity pages still read/write their (renamed) tables.
