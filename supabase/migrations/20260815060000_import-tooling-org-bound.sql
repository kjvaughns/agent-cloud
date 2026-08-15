-- Three tables the org-bound pass missed on the way through.
--
-- ── What happened ──
--
-- `20260815050000` rewrote every policy that tested an agency-level role
-- without naming an organization. It was re-recorded and applied as
-- `20260815045002`, and that re-record covers all of it except three tables:
--
--   import_jobs        admin_all_import_jobs
--   import_duplicates  admin_all_duplicates
--   migration_roster   admin_all_migration_roster
--
-- All three carry the same shape as the rest:
--
--   auth.uid() IN (SELECT user_id FROM user_roles WHERE role IN ('admin','manager'))
--
-- `user_roles` is `(user_id, role)` with no `organization_id`, so that asks
-- "is this person an admin anywhere" and answers yes for an admin of any
-- agency on the platform. An import job carries the imported roster — third
-- party names and contact details belonging to one agency's book — and
-- `migration_roster` is the same thing again.
--
-- ── Why this is its own migration ──
--
-- Re-running `20260815050000` would work, but it would also re-drop and
-- re-create fifty other policies that are already correct in production, and a
-- migration that touches fifty policies to fix three is a migration nobody can
-- review. This one names exactly what it changes.
--
-- Idempotent and forward-only. Safe whether or not the three are currently
-- leaking: if a previous run already fixed them, this rewrites them to the
-- same definitions.
--
-- `import_jobs`, `import_duplicates` and `scrape_requests` each keep their
-- `agents_own_*` policy, so an agent's own rows are unaffected either way.
-- `migration_roster` has no agent-facing policy — it is platform tooling, so
-- it becomes platform-only.

-- Import jobs and their duplicate rows are keyed on the agent who ran the
-- import, so "an admin" means an admin of that agent's agency.
drop policy if exists admin_all_import_jobs on public.import_jobs;
create policy admin_all_import_jobs on public.import_jobs for all
  using (is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists admin_all_duplicates on public.import_duplicates;
create policy admin_all_duplicates on public.import_duplicates for all
  using (is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_admin_of_agent(agent_id) or is_platform_admin());

-- No agent dimension at all: this is the platform's own migration tooling, and
-- it holds third-party PII from imported rosters.
drop policy if exists admin_all_migration_roster on public.migration_roster;
create policy admin_all_migration_roster on public.migration_roster for all
  using (is_platform_admin()) with check (is_platform_admin());

notify pgrst, 'reload schema';
