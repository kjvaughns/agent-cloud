-- ============================================================================
-- THE BOOK OF BUSINESS CARRIES THE SAMPLE FLAG
--
-- `get_book_of_business` is the only way the policy list is read, and its
-- return shape did not include `is_sample`. That meant a seeded policy was
-- indistinguishable from a real one on the page where an agency looks at its
-- production — which is the exact confusion `is_sample` exists to prevent, on
-- the exact screen where it matters most.
--
-- Requires 20260805130000, which adds the column.
--
-- A dropped-and-recreated function rather than `create or replace`, because
-- Postgres refuses to replace a function whose return type changed. The drop
-- is safe: one caller (`listBookOfBusiness`), which maps the rows as `any[]`
-- and reads them by name, so a new column is additive to it.
-- ============================================================================

drop function if exists public.get_book_of_business(text, uuid);

create function public.get_book_of_business(_scope text, _agent_id uuid default null)
returns table (
  id uuid, client_id uuid, agent_id uuid, carrier_id uuid, carrier_name text,
  product text, policy_number text, status policy_status,
  monthly_premium numeric, annual_premium numeric, face_amount numeric,
  effective_date date, posted_at timestamptz, carrier_integration text,
  is_gtl boolean, client_first_name text, client_last_name text,
  agent_first_name text, agent_last_name text,
  is_sample boolean
)
language sql stable security definer set search_path = public
as $$
  with scope_agents as (
    select s from public.scope_agent_ids(_scope) s
     where _agent_id is null or s = _agent_id
  )
  select
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name as carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date, pol.posted_at, pol.carrier_integration, pol.is_gtl,
    cli.first_name, cli.last_name,
    pr.first_name, pr.last_name,
    coalesce(pol.is_sample, false)
  from public.policies pol
  left join public.clients  cli on cli.id = pol.client_id
  left join public.profiles pr  on pr.id  = pol.agent_id
  left join public.carriers car on car.id = pol.carrier_id
  where pol.agent_id in (select s from scope_agents where s is not null)
  order by pol.posted_at desc;
$$;

grant execute on function public.get_book_of_business(text, uuid) to authenticated;

notify pgrst, 'reload schema';
