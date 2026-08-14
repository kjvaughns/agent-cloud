-- ---------------------------------------------------------------------------
-- SOCIAL SECURITY IS A WAY CLIENTS PAY
--
-- A large share of final-expense premium is drawn from the client's Social
-- Security deposit, and when the draft lands matters: a day early and the
-- account is empty, the payment bounces, and a perfectly good policy lapses
-- over timing rather than over affordability.
--
-- Post-a-Deal is gaining a "how the premium is paid" block that writes the
-- existing `client_banking` row — method and day of month only, never an
-- account or routing number. No new columns: `payment_method` and
-- `draft_date` have been there since the table was created, and the importer
-- has been filling them all along; only the manual flow never did.
--
-- What does need to change is one CHECK. The constraint admits
--
--     bank_draft, credit_card, money_order, direct_express
--
-- and 'social_security' is not among them, so the headline case of the
-- feature would have been rejected at write time. It is added here. Nothing
-- is removed — every value that was legal stays legal, so no existing row can
-- be invalidated by this and the constraint is re-created rather than dropped
-- and left off.
-- ---------------------------------------------------------------------------

alter table public.client_banking
  drop constraint if exists client_banking_payment_method_check;

alter table public.client_banking
  add constraint client_banking_payment_method_check
  check (payment_method is null or payment_method in (
    'bank_draft', 'credit_card', 'money_order', 'direct_express', 'social_security'
  ));

comment on column public.client_banking.payment_method is
  'How the client pays: bank_draft, credit_card, money_order, direct_express or social_security. Social Security deposits land on the 2nd, 3rd or 4th Wednesday by the client''s birth date — see src/lib/deals/social-security.ts.';

notify pgrst, 'reload schema';
