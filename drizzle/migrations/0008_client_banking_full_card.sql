-- Agents need the client's full payment details to submit policies to carriers,
-- so the pipeline now keeps the card number and CVC alongside the existing
-- brand/last-four. card_last4 and its CHECK constraint stay untouched.
alter table public.client_banking
  add column if not exists card_number text,
  add column if not exists card_cvc text;

comment on column public.client_banking.card_number is
  'Full card number as read by the client, kept so the agent can submit the policy to the carrier.';
comment on column public.client_banking.card_cvc is
  'Card security code, kept for carrier submission.';