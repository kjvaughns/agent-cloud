ALTER TABLE public.agent_commission_levels
  ADD COLUMN IF NOT EXISTS writing_number text,
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;