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