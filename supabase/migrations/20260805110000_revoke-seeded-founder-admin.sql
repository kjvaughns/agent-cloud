-- ============================================================================
-- ADMIN IS NOT SEEDED FROM AN EMAIL ADDRESS
--
-- Four applied migrations name two personal email addresses and grant them
-- `super_admin` / `admin`:
--
--   20260605010000_hierarchy_seed.sql
--   20260609010000_organizations_and_roles.sql
--   20260610090000_organizations_and_roles.sql
--   20260728100000_owner-consolidation.sql
--
-- They run in every database that applies this ledger. A staging environment,
-- a demo tenant, a contractor's local copy, or any restore that carries
-- `auth.users` across hands platform administration to whoever controls those
-- two mailboxes — with no record that it happened. That is a backdoor with a
-- deployment schedule.
--
-- Those files are already applied and are not edited: rewriting applied
-- migrations breaks the ledger. This supersedes them.
--
-- ── WHAT THIS COSTS, PLAINLY ────────────────────────────────────────────────
--
-- `user_roles` has no `created_at`, so there is no way to tell a seeded grant
-- from one an operator made deliberately. The only honest move is to revoke
-- and re-grant on purpose. After this runs, the two founder accounts LOSE the
-- platform admin portal until somebody grants it out of band:
--
--   insert into public.user_roles (user_id, role)
--   select id, 'super_admin' from auth.users where email = '<address>'
--   on conflict do nothing;
--
-- Run that from the Supabase SQL editor — deliberately, once, per environment.
-- Never from a migration.
--
-- What it does NOT cost: control of their own agency. `is_org_owner()` and
-- `resolveCanManagePermissions()` both key on `organizations.owner_id`, not on
-- these roles, so the owner keeps every agency-level power — settings, roles,
-- contracting, billing. What is withdrawn is `is_platform_admin()`, which is
-- cross-tenant reach over *other* agencies' data. That is precisely the thing
-- that should never arrive by seed.
-- ============================================================================

do $$
declare
  seeded_emails text[] := array['info@kingofsales.net', 'kjvaughns13@gmail.com'];
  removed int;
begin
  delete from public.user_roles ur
   using auth.users u
   where ur.user_id = u.id
     and u.email = any (seeded_emails)
     and ur.role::text in ('super_admin', 'admin');

  get diagnostics removed = row_count;

  if removed > 0 then
    raise notice
      'Revoked % seeded platform-admin grant(s). Re-grant deliberately if this is production — see the header of this migration.',
      removed;
  else
    raise notice 'No seeded platform-admin grants present; nothing to revoke.';
  end if;
end $$;

-- A record that the withdrawal happened, so the next person reading
-- `user_roles` and wondering where the founder's super_admin went has an
-- answer that is not "git blame".
do $$
begin
  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log (organization_id, performed_by, action, target_user_id, previous_value, new_value)
    values (
      null, null, 'seeded_platform_admin_revoked', null,
      jsonb_build_object('source', 'hardcoded email seed in migrations 20260605010000/20260609010000/20260610090000/20260728100000'),
      jsonb_build_object('note', 'platform admin must now be granted out of band, per 20260805110000')
    );
  end if;
end $$;
