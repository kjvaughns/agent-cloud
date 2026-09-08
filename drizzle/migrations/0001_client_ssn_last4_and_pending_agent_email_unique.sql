-- Import writes `clients.ssn_last4` (import-helpers.saveClientFullRecord) but the
-- column never existed, so every imported client insert failed outright.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ssn_last4 TEXT;

-- `upsertPendingAgent` upserts on the `email` column. Only a lower(email)
-- expression index existed, which ON CONFLICT (email) cannot use, so importing
-- a team roster failed on every row.
ALTER TABLE public.pending_agents
  ADD CONSTRAINT pending_agents_email_key UNIQUE (email);