-- ═══════════════════════════════════════════════════════════════════════════
-- Every "an admin can see this" arm becomes "an admin of THAT AGENCY can see
-- this".
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── The defect ──
--
-- `public.user_roles` is `(user_id, role)`. It has no `organization_id` and
-- never has. So `has_role(auth.uid(), 'admin')` asks "is this person an admin
-- ANYWHERE" and answers yes for an admin of any agency on the platform.
--
-- That would be harmless if `admin`, `manager` and `agency_owner` were platform
-- roles. They are not. They are issued per-agency by ordinary product flows:
--
--   • `src/lib/billing.functions.ts` inserts `agency_owner` for every
--     self-serve workspace creator.
--   • `src/lib/permissions.functions.ts` assigns `manager` / `staff` / `agent`
--     to org members.
--   • `src/lib/onboarding.functions.ts` inserts an invite's `invited_role`
--     verbatim, so `admin` is reachable by invitation.
--
-- The repository already says so, twice, in the headers of
-- `20260802140000_help-desk.sql` and `20260802150000_agency-resources.sql`:
-- "admin is an agency-level role in this schema". Those two migrations avoided
-- the trap. Fifty-two policies written before them did not.
--
-- Only `super_admin` is a genuine platform role, and `is_platform_admin()`
-- already tests exactly that. It is left alone everywhere below.
--
-- ── Proven, not inferred ──
--
-- On a scratch Postgres with all migrations applied, two unrelated agencies
-- seeded, and each owner given the `agency_owner` role the product issues:
--
--     set local role authenticated;
--     select set_config('test.uid', <agency A's owner>, true);
--     select count(*) from commission_schedule;   -- 1  ← agency B's row
--     select count(*) from policies;              -- 0  ← correctly scoped
--     select count(*) from clients;               -- 0  ← correctly scoped
--
-- Agency A's owner reads agency B's per-agent commission rates. Policies and
-- clients return zero from the same session, which is what rules out a broken
-- test: the org-scoping pass of 2026-07-30 worked, and these policies escaped
-- it.
--
-- ── Why they escaped ──
--
-- `20260730131845` added `organization_id`, a stamping trigger and a correct
-- `<tbl>_org_select` / `<tbl>_org_modify` pair to 23 tables. It also dropped
-- the old policies — by the names `<tbl>_owner_select` / `<tbl>_owner_modify`.
--
-- Where the real policy had a different name, the drop silently matched
-- nothing and the old policy survived. Permissive policies OR together, so a
-- surviving policy is not overridden by the correct one beside it; it widens
-- it. `commission_schedule.admin_read_all_commissions` and
-- `onboarding_documents.onboarding_docs_*` are exactly this, which is why the
-- fix for those three is a plain DROP: the correct policy is already there and
-- has been all along.
--
-- ── The replacement ──
--
-- `is_admin_of_agent(_agent)` — am I an admin of an agency this agent is
-- actively a member of? It is built on `is_org_admin`, which already requires
-- an active membership in that specific org, so the org bound comes from the
-- existing helper rather than a new rule invented here.
--
-- This preserves the intent of every policy it touches. An agency admin keeps
-- seeing their own agents' rows. They stop seeing everybody else's.
--
-- ── What this deliberately does not do ──
--
-- No column is added, no data is moved, no policy is made stricter than its
-- author intended. Nothing is dropped except three policies whose access is
-- already granted by a correct policy on the same table. There is no window in
-- which a table is left unprotected: every drop-and-recreate below is one
-- statement pair inside the same migration, and the CREATE names the same
-- rows the DROP did, minus the other agencies.
--
-- Forward-only and idempotent: every policy is dropped if present before being
-- created, so re-running changes nothing.

-- ───────────────────────────────────────────────────────────────────────────
-- The helper
-- ───────────────────────────────────────────────────────────────────────────

-- Shaped after `same_org`: membership-based rather than
-- `profiles.organization_id`, so somebody who belongs to two agencies is
-- handled the same way the rest of the schema handles them.
create or replace function public.is_admin_of_agent(_agent uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _agent is not null and exists (
    select 1 from public.organization_memberships m
     where m.profile_id = _agent
       and m.status = 'active'
       and public.is_org_admin(m.organization_id)
  )
$$;

comment on function public.is_admin_of_agent(uuid) is
  'Am I an admin or owner of an agency this agent actively belongs to? The '
  'org-bounded replacement for has_role(auth.uid(), ''admin''), which is '
  'unbounded because user_roles has no organization_id.';

-- Storage object paths are `<agent uuid>/<file>`. The folder segment is text
-- and is not guaranteed to be a uuid, so it is checked before casting: a
-- malformed path must read as "no access", not raise.
create or replace function public.is_admin_of_agent_folder(_folder text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _folder ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     and public.is_admin_of_agent(_folder::uuid)
$$;

grant execute on function public.is_admin_of_agent(uuid) to authenticated;
grant execute on function public.is_admin_of_agent_folder(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Three pure drops — the correct policy is already beside them
-- ───────────────────────────────────────────────────────────────────────────
--
-- `commission_schedule_org_select` and `onboarding_documents_org_select` /
-- `_org_modify` were created by 20260730131845 and grant every access these
-- three do, bounded to the reader's own agencies. Dropping these takes nothing
-- away from anyone who should have had it.

drop policy if exists admin_read_all_commissions on public.commission_schedule;
drop policy if exists onboarding_docs_select on public.onboarding_documents;
drop policy if exists onboarding_docs_modify on public.onboarding_documents;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Agent-keyed tables — the admin arm becomes an admin-of-that-agent arm
-- ───────────────────────────────────────────────────────────────────────────

-- Licensing and appointment state.
drop policy if exists "surelc_progress_select" on public.surelc_progress;
create policy "surelc_progress_select" on public.surelc_progress for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "surelc_progress_modify" on public.surelc_progress;
create policy "surelc_progress_modify" on public.surelc_progress for all
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "pdb_uploads read" on public.pdb_uploads;
create policy "pdb_uploads read" on public.pdb_uploads for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "pdb_uploads write" on public.pdb_uploads;
create policy "pdb_uploads write" on public.pdb_uploads for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "agent_current_contracts read" on public.agent_current_contracts;
create policy "agent_current_contracts read" on public.agent_current_contracts for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "agent_current_contracts agent write" on public.agent_current_contracts;
create policy "agent_current_contracts agent write" on public.agent_current_contracts for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "pa_owner_all" on public.producer_agreements;
create policy "pa_owner_all" on public.producer_agreements for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "bgq_owner_all" on public.background_questions;
create policy "bgq_owner_all" on public.background_questions for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

-- The record of who looked at an SSN. The one log that must not be
-- cross-readable, since reading it is itself the thing being audited.
drop policy if exists "ssn_audit_owner_select" on public.ssn_audit_log;
create policy "ssn_audit_owner_select" on public.ssn_audit_log for select
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

-- Agent-owned tooling and derived data.
drop policy if exists "alp_owner_all" on public.agent_landing_pages;
create policy "alp_owner_all" on public.agent_landing_pages for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "agent_phone_settings_owner_select" on public.agent_phone_settings;
create policy "agent_phone_settings_owner_select" on public.agent_phone_settings for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "agent_phone_settings_owner_modify" on public.agent_phone_settings;
create policy "agent_phone_settings_owner_modify" on public.agent_phone_settings for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "ai_insights_select" on public.ai_insights;
create policy "ai_insights_select" on public.ai_insights for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "ai_insights_modify" on public.ai_insights;
create policy "ai_insights_modify" on public.ai_insights for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "analytics_insight_cache_select" on public.analytics_insight_cache;
create policy "analytics_insight_cache_select" on public.analytics_insight_cache for select
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "analytics_insight_cache_modify" on public.analytics_insight_cache;
create policy "analytics_insight_cache_modify" on public.analytics_insight_cache for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

-- Case work.
drop policy if exists "cdr_owner_select" on public.case_design_requests;
create policy "cdr_owner_select" on public.case_design_requests for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "cdr_admin_update" on public.case_design_requests;
create policy "cdr_admin_update" on public.case_design_requests for update
  using (is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "cdr_admin_delete" on public.case_design_requests;
create policy "cdr_admin_delete" on public.case_design_requests for delete
  using (is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "rc_owner_select" on public.retirement_cases;
create policy "rc_owner_select" on public.retirement_cases for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "rc_owner_modify" on public.retirement_cases;
create policy "rc_owner_modify" on public.retirement_cases for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

-- Change requests are keyed on both the submitter and the agent they concern.
drop policy if exists "change_requests_select" on public.change_requests;
create policy "change_requests_select" on public.change_requests for select
  using (submitted_by = auth.uid() or agent_id = auth.uid()
         or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "change_requests_update_admin" on public.change_requests;
create policy "change_requests_update_admin" on public.change_requests for update
  using (submitted_by = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (submitted_by = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "change_requests_delete" on public.change_requests;
create policy "change_requests_delete" on public.change_requests for delete
  using (submitted_by = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "reminder_log_select" on public.reminder_log;
create policy "reminder_log_select" on public.reminder_log for select
  using (sent_by = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

-- A commission level request decides what an agent is paid. `agency_owner`
-- here was the widest arm of all: every such request on the platform.
drop policy if exists "commission_level_requests_read" on public.commission_level_requests;
create policy "commission_level_requests_read" on public.commission_level_requests for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "commission_level_requests_decide" on public.commission_level_requests;
create policy "commission_level_requests_decide" on public.commission_level_requests for update
  using (is_in_downline(auth.uid(), agent_id) or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_in_downline(auth.uid(), agent_id) or is_admin_of_agent(agent_id) or is_platform_admin());

-- Recruiting notes: this one is not a subquery over an RLS-protected parent
-- despite its name, so the admin arm really was unbounded.
drop policy if exists "rpn_via_prospect_modify" on public.recruiting_prospect_notes;
create policy "rpn_via_prospect_modify" on public.recruiting_prospect_notes for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

-- Pending agents are keyed on the upline who invited them.
drop policy if exists "pending_agents_upline_or_admin" on public.pending_agents;
create policy "pending_agents_upline_or_admin" on public.pending_agents for all
  using (auth.uid() = upline_id or is_admin_of_agent(upline_id) or is_platform_admin())
  with check (auth.uid() = upline_id or is_admin_of_agent(upline_id) or is_platform_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Import and scrape tooling — agent-keyed, so admin means their admin
-- ───────────────────────────────────────────────────────────────────────────
--
-- Each of these already has an `agents_own_*` policy. The admin policy beside
-- it was the cross-tenant one, and an import job carries the imported roster:
-- third-party names and contact details belonging to one agency's book.

drop policy if exists admin_all_import_jobs on public.import_jobs;
create policy admin_all_import_jobs on public.import_jobs for all
  using (is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists admin_all_duplicates on public.import_duplicates;
create policy admin_all_duplicates on public.import_duplicates for all
  using (is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists admin_all_scrape_requests on public.scrape_requests;
create policy admin_all_scrape_requests on public.scrape_requests for all
  using (is_admin_of_agent(requesting_agent_id) or is_platform_admin())
  with check (is_admin_of_agent(requesting_agent_id) or is_platform_admin());

-- Already bounded by `organization_id in (select my_org_ids())`, so this was
-- never a leak. Rewritten anyway so the rule below needs no exception list,
-- and because `is_org_admin(organization_id)` says what the three-role test
-- was reaching for.
drop policy if exists import_proposals_admin_shared on public.import_proposals;
create policy import_proposals_admin_shared on public.import_proposals for all
  using (scope = 'shared' and organization_id is not null and is_org_admin(organization_id))
  with check (scope = 'shared' and organization_id is not null and is_org_admin(organization_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Policies that delegate to an RLS-protected parent
-- ───────────────────────────────────────────────────────────────────────────
--
-- These were already bounded: the subquery reads a parent table whose own RLS
-- restricts it to rows the reader can see, so the admin arm could only widen
-- access within the reader's own agency. They are rewritten so that the
-- guarantee is stated in the policy rather than depending on a reader knowing
-- that RLS applies inside policy subqueries.

drop policy if exists client_financials_via_client on public.client_financials;
create policy client_financials_via_client on public.client_financials for all
  using (exists (select 1 from public.clients c where c.id = client_id
                   and (c.agent_id = auth.uid() or is_in_downline(auth.uid(), c.agent_id)
                        or is_admin_of_agent(c.agent_id))))
  with check (exists (select 1 from public.clients c where c.id = client_id
                   and (c.agent_id = auth.uid() or is_admin_of_agent(c.agent_id))));

drop policy if exists life_events_via_client on public.life_events;
create policy life_events_via_client on public.life_events for all
  using (exists (select 1 from public.clients c where c.id = client_id
                   and (c.agent_id = auth.uid() or is_in_downline(auth.uid(), c.agent_id)
                        or is_admin_of_agent(c.agent_id))))
  with check (exists (select 1 from public.clients c where c.id = client_id
                   and (c.agent_id = auth.uid() or is_admin_of_agent(c.agent_id))));

drop policy if exists dial_list_entries_via_list on public.dial_list_entries;
create policy dial_list_entries_via_list on public.dial_list_entries for all
  using (exists (select 1 from public.dial_lists dl where dl.id = list_id
                   and (dl.agent_id = auth.uid() or is_in_downline(auth.uid(), dl.agent_id)
                        or is_admin_of_agent(dl.agent_id))))
  with check (exists (select 1 from public.dial_lists dl where dl.id = list_id
                   and (dl.agent_id = auth.uid() or is_admin_of_agent(dl.agent_id))));

drop policy if exists sms_messages_via_conversation on public.sms_messages;
create policy sms_messages_via_conversation on public.sms_messages for all
  using (exists (select 1 from public.sms_conversations sc where sc.id = conversation_id
                   and (sc.agent_id = auth.uid() or is_in_downline(auth.uid(), sc.agent_id)
                        or is_admin_of_agent(sc.agent_id))))
  with check (exists (select 1 from public.sms_conversations sc where sc.id = conversation_id
                   and (sc.agent_id = auth.uid() or is_admin_of_agent(sc.agent_id))));

drop policy if exists rpn_via_prospect_select on public.recruiting_prospect_notes;
create policy rpn_via_prospect_select on public.recruiting_prospect_notes for select
  using (exists (select 1 from public.recruiting_prospects rp where rp.id = prospect_id
                   and (rp.recruiter_id = auth.uid() or is_in_downline(auth.uid(), rp.recruiter_id)
                        or is_admin_of_agent(rp.recruiter_id))));

drop policy if exists rpsh_via_prospect_select on public.recruiting_prospect_stage_history;
create policy rpsh_via_prospect_select on public.recruiting_prospect_stage_history for select
  using (exists (select 1 from public.recruiting_prospects rp where rp.id = prospect_id
                   and (rp.recruiter_id = auth.uid() or is_in_downline(auth.uid(), rp.recruiter_id)
                        or is_admin_of_agent(rp.recruiter_id))));

drop policy if exists rpsh_via_prospect_modify on public.recruiting_prospect_stage_history;
create policy rpsh_via_prospect_modify on public.recruiting_prospect_stage_history for all
  using (exists (select 1 from public.recruiting_prospects rp where rp.id = prospect_id
                   and (rp.recruiter_id = auth.uid() or is_admin_of_agent(rp.recruiter_id))))
  with check (exists (select 1 from public.recruiting_prospects rp where rp.id = prospect_id
                   and (rp.recruiter_id = auth.uid() or is_admin_of_agent(rp.recruiter_id))));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. The org-scoped one that discarded its own scoping
-- ───────────────────────────────────────────────────────────────────────────
--
-- `ai_message_log_read` does the right thing three times and then ORs a bare
-- role test, which discards all of it. The log holds whatever client and agent
-- data was sent to the model.

drop policy if exists ai_message_log_read on public.ai_message_log;
create policy ai_message_log_read on public.ai_message_log for select
  using (is_platform_admin()
         or agent_id = auth.uid()
         or (organization_id is not null and is_org_admin(organization_id)));

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Platform tooling — genuinely platform, so genuinely platform-only
-- ───────────────────────────────────────────────────────────────────────────
--
-- These four have no agency dimension at all. `migration_roster` and
-- `waitlist_signups` hold third-party PII — imported rosters and inbound leads
-- — which every agency owner on the platform could read.
--
-- `is_platform_admin()` tests `super_admin`, which is the only role in
-- `user_roles` that is not issued per-agency.

drop policy if exists admin_only on public.admin_audit_log;
create policy admin_only on public.admin_audit_log for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_manager_only on public.admin_import_jobs;
create policy admin_manager_only on public.admin_import_jobs for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_all_migration_roster on public.migration_roster;
create policy admin_all_migration_roster on public.migration_roster for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "Admins can read waitlist" on public.waitlist_signups;
create policy "Admins can read waitlist" on public.waitlist_signups for select
  using (is_platform_admin());

drop policy if exists "Admins can update waitlist" on public.waitlist_signups;
create policy "Admins can update waitlist" on public.waitlist_signups for update
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "Admins can delete waitlist" on public.waitlist_signups;
create policy "Admins can delete waitlist" on public.waitlist_signups for delete
  using (is_platform_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Global reference data — writable by the platform, not by every agency
-- ───────────────────────────────────────────────────────────────────────────
--
-- `carriers`, `faq_items` and the NULL-org tier of `commission_grids` are
-- shared by every agency. An agency admin could edit all three, so one
-- agency's edit to a carrier or a default comp grid changed what every other
-- agency saw.
--
-- Each keeps its own per-agency write path, which is where an agency's own
-- carriers and grids belong:
--   • `carriers_private_write`  — is_private and is_org_owner(owner_organization_id)
--   • `commission_grids_write`  — organization_id is not null and is_org_owner(...)

drop policy if exists carriers_admin_write on public.carriers;
create policy carriers_admin_write on public.carriers for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists faq_admin_write on public.faq_items;
create policy faq_admin_write on public.faq_items for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists commission_grids_admin_write on public.commission_grids;
create policy commission_grids_admin_write on public.commission_grids for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Storage — the identity documents
-- ───────────────────────────────────────────────────────────────────────────
--
-- Objects are stored at `<agent uuid>/<file>`, so the path is enumerable from
-- any profile row a reader can already see. `producer-docs` holds government
-- ID, voided checks and SSN-bearing contracting paperwork; `agent-documents`
-- and `imports` hold uploaded books of business.
--
-- Ranked first among these findings because the payload is raw identity
-- documents and listing a folder needs nothing but somebody else's user id.

drop policy if exists producer_docs_owner_select on storage.objects;
create policy producer_docs_owner_select on storage.objects for select
  using (bucket_id = 'producer-docs'
         and (auth.uid()::text = (storage.foldername(name))[1]
              or public.is_in_downline(auth.uid(), ((storage.foldername(name))[1])::uuid)
              or public.is_admin_of_agent_folder((storage.foldername(name))[1])
              or public.is_platform_admin()));

drop policy if exists agent_docs_owner_select on storage.objects;
create policy agent_docs_owner_select on storage.objects for select
  using (bucket_id = 'agent-documents'
         and (auth.uid()::text = (storage.foldername(name))[1]
              or public.is_admin_of_agent_folder((storage.foldername(name))[1])
              or public.is_platform_admin()));

drop policy if exists imports_owner_select on storage.objects;
create policy imports_owner_select on storage.objects for select
  using (bucket_id = 'imports'
         and (auth.uid()::text = (storage.foldername(name))[1]
              or public.is_in_downline(auth.uid(), ((storage.foldername(name))[1])::uuid)
              or public.is_admin_of_agent_folder((storage.foldername(name))[1])
              or public.is_platform_admin()));

notify pgrst, 'reload schema';
