-- Claiming runs on every pipeline load and every import, so the "nothing to
-- claim" case — which is almost every call — must not scan these tables.
create index if not exists clients_assigned_to_email_lower_idx
  on public.clients (lower(assigned_to_email)) where assigned_to_email is not null;
create index if not exists policies_assigned_to_email_lower_idx
  on public.policies (lower(assigned_to_email)) where assigned_to_email is not null;
create index if not exists contact_history_assigned_to_email_lower_idx
  on public.contact_history (lower(assigned_to_email)) where assigned_to_email is not null;

-- The duplicate scan looks policies up by number across the agency.
create index if not exists policies_policy_number_lower_idx
  on public.policies (lower(trim(policy_number))) where policy_number is not null;