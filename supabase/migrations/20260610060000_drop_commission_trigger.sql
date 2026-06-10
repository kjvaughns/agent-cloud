-- Drop DB-layer commission trigger — JS calculator in commission-calculator.ts
-- is the single source of truth for commission_schedule rows.
-- IMPORTANT: Apply this migration BEFORE deploying the JS commission calculator.
DROP TRIGGER IF EXISTS trg_generate_commission_schedule ON public.policies;
DROP FUNCTION IF EXISTS public.generate_commission_schedule();
