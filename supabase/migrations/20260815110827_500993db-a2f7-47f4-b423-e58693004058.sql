-- 20260815060000_import-tooling-org-bound.sql (guarded: these tables may not exist)
do $$ begin
  if to_regclass('public.import_jobs') is not null then
    drop policy if exists admin_all_import_jobs on public.import_jobs;
    create policy admin_all_import_jobs on public.import_jobs for all
      using (is_admin_of_agent(agent_id) or is_platform_admin())
      with check (is_admin_of_agent(agent_id) or is_platform_admin());
  end if;

  if to_regclass('public.import_duplicates') is not null then
    drop policy if exists admin_all_duplicates on public.import_duplicates;
    create policy admin_all_duplicates on public.import_duplicates for all
      using (is_admin_of_agent(agent_id) or is_platform_admin())
      with check (is_admin_of_agent(agent_id) or is_platform_admin());
  end if;

  if to_regclass('public.migration_roster') is not null then
    drop policy if exists admin_all_migration_roster on public.migration_roster;
    create policy admin_all_migration_roster on public.migration_roster for all
      using (is_platform_admin()) with check (is_platform_admin());
  end if;
end $$;

notify pgrst, 'reload schema';