UPDATE public.producer_documents d
SET agent_id = NULL
WHERE agent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = d.agent_id);

ALTER TABLE public.producer_documents
  ADD CONSTRAINT producer_documents_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS producer_documents_agent_id_idx ON public.producer_documents(agent_id);