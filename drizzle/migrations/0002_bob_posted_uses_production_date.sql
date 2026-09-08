CREATE OR REPLACE FUNCTION public.get_book_of_business(_scope text, _agent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, client_id uuid, agent_id uuid, carrier_id uuid, carrier_name text, product text, policy_number text, status policy_status, monthly_premium numeric, annual_premium numeric, face_amount numeric, effective_date date, posted_at timestamp with time zone, carrier_integration text, is_gtl boolean, client_first_name text, client_last_name text, agent_first_name text, agent_last_name text, is_sample boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with scope_agents as (
    select s from public.scope_agent_ids(_scope) s
     where _agent_id is null or s = _agent_id
  )
  select
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name as carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date,
    -- The date a policy "counts" is the production/sale date once somebody
    -- sets it by hand; posted_at is only the fallback audit stamp. The book
    -- showed posted_at, so edits made on the client profile never appeared.
    coalesce(pol.production_date, pol.posted_at) as posted_at,
    pol.carrier_integration, pol.is_gtl,
    cli.first_name, cli.last_name,
    pr.first_name, pr.last_name,
    coalesce(pol.is_sample, false)
  from public.policies pol
  left join public.clients  cli on cli.id = pol.client_id
  left join public.profiles pr  on pr.id  = pol.agent_id
  left join public.carriers car on car.id = pol.carrier_id
  where pol.agent_id in (select s from scope_agents where s is not null)
  order by coalesce(pol.production_date, pol.posted_at) desc;
$function$;