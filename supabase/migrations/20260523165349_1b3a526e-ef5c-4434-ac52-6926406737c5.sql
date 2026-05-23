ALTER TABLE public.clients REPLICA IDENTITY FULL;
ALTER TABLE public.contact_history REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_history;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;