-- Add SureLC agent ID to profiles (cached on first lookup)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS surelc_agent_id text DEFAULT NULL;

-- Add SureLC request ID to contract_requests (to track status per request)
ALTER TABLE public.contract_requests
  ADD COLUMN IF NOT EXISTS surelc_request_id text DEFAULT NULL;

-- Add submitted_at timestamp to contract_requests
ALTER TABLE public.contract_requests
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT NULL;
