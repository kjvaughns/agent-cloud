-- ============================================================================
-- STOP HOLDING OTHER PLATFORMS' PASSWORDS
--
-- `scrape_requests` collected an agent's email and password for whichever CRM
-- they were leaving, so staff could log in as them and pull the book across.
-- The password was base64-encoded and stored — beneath a dialog that told the
-- agent it was "stored encrypted" — and the admin queue had a reveal button.
--
-- base64 is not encryption. It is the plaintext with extra steps, and anybody
-- with read access to this table had every one of those passwords. Asking a
-- customer for credentials to a third-party system is not something to do
-- carefully; it is something not to do, and the application no longer offers
-- it. The Cowork migration flow replaces it: the agency drives their own
-- browser session and nothing is handed over.
--
-- This clears what was already collected. Those passwords should be treated as
-- disclosed — anyone who submitted one should change it on the source platform.
-- ============================================================================

do $$
begin
  if to_regclass('public.scrape_requests') is null then
    raise notice 'scrape_requests does not exist here; nothing to clear.';
    return;
  end if;

  -- Both spellings: `20260802160000` renamed these, and either may be present
  -- depending on how far this database has been migrated.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'source_password_encrypted'
  ) then
    update public.scrape_requests set source_password_encrypted = null
     where source_password_encrypted is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'scrape_requests'
       and column_name = 'agentlink_password_encrypted'
  ) then
    update public.scrape_requests set agentlink_password_encrypted = null
     where agentlink_password_encrypted is not null;
  end if;
end $$;

-- The columns stay, nullable and empty, rather than being dropped: the request
-- rows are a real history staff may still need, and dropping a column out from
-- under generated types in the window before they are regenerated is the kind
-- of breakage `scripts/migration-safety.ts` exists to catch. Nothing writes
-- them any more, so they will stay empty.
comment on table public.scrape_requests is
  'Historical full-import requests. Credentials are no longer collected; the password columns are retained empty and must never be written again.';
