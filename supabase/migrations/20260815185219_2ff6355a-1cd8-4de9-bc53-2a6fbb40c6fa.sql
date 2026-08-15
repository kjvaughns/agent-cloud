ALTER TABLE public.document_intake
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.document_intake(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sheet_label text;

CREATE INDEX IF NOT EXISTS document_intake_parent_id_idx ON public.document_intake(parent_id);