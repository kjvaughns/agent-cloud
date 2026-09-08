-- 1. Indexes for agent-grouped contracting reads
CREATE INDEX IF NOT EXISTS contracting_requests_org_agent_idx
  ON public.contracting_requests (organization_id, agent_id);
CREATE INDEX IF NOT EXISTS contracting_requests_org_updated_idx
  ON public.contracting_requests (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS contracting_requests_writing_number_idx
  ON public.contracting_requests (organization_id, writing_number)
  WHERE writing_number IS NOT NULL;

-- 2. Granular contracting permissions for contracting specialists
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS contracting_update_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracting_set_writing_number boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracting_note_agent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracting_note_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracting_request_info boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracting_manage_sheets boolean NOT NULL DEFAULT false;

-- Existing contracting staff keep working: anybody who could already submit or
-- approve gets the finer-grained equivalents of what they already had.
UPDATE public.role_permissions
   SET contracting_update_status = true,
       contracting_set_writing_number = true,
       contracting_note_agent = true,
       contracting_note_internal = true,
       contracting_request_info = true
 WHERE contracting_submit OR contracting_approve OR staff_is_admin;

-- 3. Google Sheets contracting sync: one connected sheet per agency
CREATE TABLE IF NOT EXISTS public.contracting_sheet_links (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text,
  tab_name text NOT NULL DEFAULT 'Contracting',
  connected_by uuid,
  health text NOT NULL DEFAULT 'unknown',
  last_error text,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contracting_sheet_links TO service_role;
ALTER TABLE public.contracting_sheet_links ENABLE ROW LEVEL SECURITY;

-- Per-request sync state, keyed by the immutable request id
CREATE TABLE IF NOT EXISTS public.contracting_sheet_rows (
  request_id uuid PRIMARY KEY REFERENCES public.contracting_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_status text NOT NULL DEFAULT 'pending',
  sync_error text,
  pushed_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  pushed_updated_at timestamptz,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contracting_sheet_rows_org_idx
  ON public.contracting_sheet_rows (organization_id, sync_status);
GRANT ALL ON public.contracting_sheet_rows TO service_role;
ALTER TABLE public.contracting_sheet_rows ENABLE ROW LEVEL SECURITY;

-- 4. Encrypted per-user Google connection keys (server-only)
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;