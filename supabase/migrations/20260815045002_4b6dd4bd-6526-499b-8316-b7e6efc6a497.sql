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
  'Am I an admin or owner of an agency this agent actively belongs to? The org-bounded replacement for has_role(auth.uid(), ''admin''), which is unbounded because user_roles has no organization_id.';

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

drop policy if exists admin_read_all_commissions on public.commission_schedule;
drop policy if exists onboarding_docs_select on public.onboarding_documents;
drop policy if exists onboarding_docs_modify on public.onboarding_documents;

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

drop policy if exists "ssn_audit_owner_select" on public.ssn_audit_log;
create policy "ssn_audit_owner_select" on public.ssn_audit_log for select
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

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

drop policy if exists "commission_level_requests_read" on public.commission_level_requests;
create policy "commission_level_requests_read" on public.commission_level_requests for select
  using (agent_id = auth.uid() or is_in_downline(auth.uid(), agent_id)
         or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "commission_level_requests_decide" on public.commission_level_requests;
create policy "commission_level_requests_decide" on public.commission_level_requests for update
  using (is_in_downline(auth.uid(), agent_id) or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (is_in_downline(auth.uid(), agent_id) or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "rpn_via_prospect_modify" on public.recruiting_prospect_notes;
create policy "rpn_via_prospect_modify" on public.recruiting_prospect_notes for all
  using (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin())
  with check (agent_id = auth.uid() or is_admin_of_agent(agent_id) or is_platform_admin());

drop policy if exists "pending_agents_upline_or_admin" on public.pending_agents;
create policy "pending_agents_upline_or_admin" on public.pending_agents for all
  using (auth.uid() = upline_id or is_admin_of_agent(upline_id) or is_platform_admin())
  with check (auth.uid() = upline_id or is_admin_of_agent(upline_id) or is_platform_admin());

drop policy if exists admin_all_scrape_requests on public.scrape_requests;
create policy admin_all_scrape_requests on public.scrape_requests for all
  using (is_admin_of_agent(requesting_agent_id) or is_platform_admin())
  with check (is_admin_of_agent(requesting_agent_id) or is_platform_admin());

drop policy if exists import_proposals_admin_shared on public.import_proposals;
create policy import_proposals_admin_shared on public.import_proposals for all
  using (scope = 'shared' and organization_id is not null and is_org_admin(organization_id))
  with check (scope = 'shared' and organization_id is not null and is_org_admin(organization_id));

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

drop policy if exists ai_message_log_read on public.ai_message_log;
create policy ai_message_log_read on public.ai_message_log for select
  using (is_platform_admin()
         or agent_id = auth.uid()
         or (organization_id is not null and is_org_admin(organization_id)));

drop policy if exists admin_only on public.admin_audit_log;
create policy admin_only on public.admin_audit_log for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_manager_only on public.admin_import_jobs;
create policy admin_manager_only on public.admin_import_jobs for all
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

drop policy if exists carriers_admin_write on public.carriers;
create policy carriers_admin_write on public.carriers for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists faq_admin_write on public.faq_items;
create policy faq_admin_write on public.faq_items for all
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists commission_grids_admin_write on public.commission_grids;
create policy commission_grids_admin_write on public.commission_grids for all
  using (is_platform_admin()) with check (is_platform_admin());

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