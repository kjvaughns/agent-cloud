-- ============================================================================
-- CLIENT BANKING — CREDIT CARD FIELDS
--
--   The Payment Method selector offered "Credit Card" but the form only ever
--   showed bank draft fields, so an agent taking a card had nowhere to put it.
--
-- WHAT IS DELIBERATELY NOT STORED
--
--   * The CVC / CVV is never persisted. PCI DSS Requirement 3.2 prohibits
--     storing it after authorization, full stop — there is no encryption or
--     retention policy that makes it permissible. The field exists in the UI
--     so an agent can read it to the carrier during the call, and it is
--     discarded when the drawer closes. There is no column for it here, on
--     purpose, so it cannot be added by accident later.
--
--   * The full card number (PAN) is not stored either. Keeping PANs would pull
--     the whole platform into PCI DSS scope. Only the brand and last four are
--     kept — enough to identify the card on file to a client or a carrier.
--
--   Expiry and cardholder name are stored: carriers require them and neither
--   is prohibited data on its own.
--
-- Run after 20260725100000_landing-demo-requests.sql.
-- ============================================================================

alter table public.client_banking
  add column if not exists card_brand     text,
  add column if not exists card_last4     text,
  add column if not exists card_name      text,
  add column if not exists card_exp_month smallint,
  add column if not exists card_exp_year  smallint,
  add column if not exists payment_method text,
  add column if not exists draft_date     smallint;

-- Guard rails so a future writer cannot quietly start storing a full PAN in
-- the last-four column.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_card_last4_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_card_last4_check
      check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_card_exp_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_card_exp_check
      check (
        (card_exp_month is null or card_exp_month between 1 and 12)
        and (card_exp_year is null or card_exp_year between 2000 and 2100)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.client_banking'::regclass
       and conname = 'client_banking_payment_method_check'
  ) then
    alter table public.client_banking
      add constraint client_banking_payment_method_check
      check (payment_method is null or payment_method in ('bank_draft','credit_card','money_order','direct_express'));
  end if;
end
$do$;
