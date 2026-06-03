-- Extend client_banking for additional payment tracking fields
alter table public.client_banking
  add column if not exists draft_date int check (draft_date between 1 and 28),
  add column if not exists payment_method text default 'bank_draft';
