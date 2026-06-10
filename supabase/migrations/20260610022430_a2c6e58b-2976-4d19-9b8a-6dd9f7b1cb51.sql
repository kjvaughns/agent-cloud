-- Flag GTL carrier for commission calculator
UPDATE public.carriers
   SET advance_cap='fixed', advance_cap_amount=600, advance_cap_months=6
 WHERE name ILIKE '%guarantee trust life%' OR name ILIKE '%GTL%';

-- Drop legacy DB-side commission trigger to prevent double-writes; calculator is now in app code.
DROP TRIGGER IF EXISTS trg_generate_commission_schedule ON public.policies;