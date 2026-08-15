GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_backfill_queue TO authenticated;
GRANT ALL ON public.commission_backfill_queue TO service_role;
ALTER TABLE public.commission_backfill_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_backfill_queue_admin ON public.commission_backfill_queue;
CREATE POLICY commission_backfill_queue_admin ON public.commission_backfill_queue
FOR ALL TO authenticated
USING (is_platform_admin())
WITH CHECK (is_platform_admin());