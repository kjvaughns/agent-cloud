-- ---------------------------------------------------------------------------
-- THE IMPORT SOURCE LOSES ITS BRAND NAME
--
-- `scrape_requests` holds the credentials an agent hands over so the platform
-- can pull their book across from wherever they were before. Two of its
-- columns were named after that provider.
--
-- Deliberately narrow. Two things keep the old name and both on purpose:
--
--   the `source` tags on already-imported rows ('agentlink_import',
--   'agentlink_xls') — those record where somebody's data actually came from,
--   which is history rather than branding, and rewriting them would destroy
--   the only answer to "where did this client come from"
--
--   the API host in the importer — it is an address, not a label, and the
--   integration still has to reach it
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'agentlink_username'
  ) then
    alter table public.scrape_requests rename column agentlink_username to source_username;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'agentlink_password_encrypted'
  ) then
    alter table public.scrape_requests
      rename column agentlink_password_encrypted to source_password_encrypted;
  end if;
end $$;

comment on column public.scrape_requests.source_username is
  'Username on the platform this agent is importing their book from.';
comment on column public.scrape_requests.source_password_encrypted is
  'Obfuscated password for that platform. Held only until the import completes.';

notify pgrst, 'reload schema';
