alter table public.contract_requests
  add column if not exists loa text,
  add column if not exists source text default 'requested';

alter table public.contract_requests
  drop constraint if exists contract_requests_agent_carrier_unique;
alter table public.contract_requests
  add constraint contract_requests_agent_carrier_unique unique (agent_id, carrier_id);
