ALTER TABLE public.document_intake
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS document_intake_resume_idx
  ON public.document_intake (status, heartbeat_at)
  WHERE status IN ('queued', 'analyzing');

DROP POLICY IF EXISTS "imports own folder read" ON storage.objects;
CREATE POLICY "imports own folder read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "imports own folder write" ON storage.objects;
CREATE POLICY "imports own folder write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "imports own folder delete" ON storage.objects;
CREATE POLICY "imports own folder delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);