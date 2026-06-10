-- Allow admins/managers to read all commission_schedule rows for auditing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='commission_schedule' AND policyname='admin_read_all_commissions'
  ) THEN
    CREATE POLICY "admin_read_all_commissions" ON public.commission_schedule
      FOR SELECT
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin', 'agency_owner', 'manager')
        )
      );
  END IF;
END $$;
