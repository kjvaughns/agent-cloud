-- ---------------------------------------------------------------------------
-- A COMMISSION LEVEL REQUEST CAN FINALLY BE ANSWERED
--
-- `commission_level_requests` has carried exactly two policies since it was
-- created:
--
--   "own"         using (agent_id = auth.uid())            -- FOR ALL
--   "upline_read" using (agent_id in (…direct reports…))   -- FOR SELECT
--
-- So an agent raises a request, their upline sees it in the Work Inbox — and
-- nobody can act on it. The upline may read it and nothing else; the only
-- account that may update the row is the agent who raised it, which is not a
-- decision anybody wants them making about their own commission.
--
-- The result is an inbox item that can never be cleared. Every request ever
-- raised is still sitting there.
--
-- Two more things wrong with the read side, fixed here as well:
--
--   `upline_read` matches `upline_id = auth.uid()` — direct reports only. A
--   manager two levels up never saw the request at all, which is the same
--   one-level bug already fixed in the matrix and the work inbox.
--
--   An agency owner or admin who is not in the agent's upline chain could not
--   see it either, though they are usually the person who sets levels.
-- ---------------------------------------------------------------------------

-- Who decided, and when. `status` alone cannot tell you whether a request was
-- answered or simply edited.
alter table public.commission_level_requests
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

drop policy if exists "upline_read" on public.commission_level_requests;

create policy commission_level_requests_read on public.commission_level_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- The decision. Deliberately excludes the agent who raised it: `own` above
-- still lets them withdraw their own request, but approving your own
-- commission level is not a thing this table should permit.
create policy commission_level_requests_decide on public.commission_level_requests
  for update to authenticated
  using (
    public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  with check (
    public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

create index if not exists idx_commission_level_requests_pending
  on public.commission_level_requests(agent_id, status)
  where status = 'pending';

notify pgrst, 'reload schema';
