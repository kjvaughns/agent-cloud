ALTER TABLE public.contracting_requests DROP CONSTRAINT IF EXISTS contracting_requests_status_check;
ALTER TABLE public.contracting_requests ADD CONSTRAINT contracting_requests_status_check CHECK (status = ANY (ARRAY[
  'draft','missing_information','missing_documents','awaiting_agent','awaiting_manager',
  'awaiting_owner_approval','ready_to_submit','assigned','submitted','carrier_reviewing',
  'nigo','additional_info_requested','approved','writing_number_issued','declined',
  'cancelled','closed','invite_sent','active'
]));

ALTER TABLE public.contracting_requests
  ADD COLUMN IF NOT EXISTS granted_comp_level_id uuid REFERENCES public.carrier_comp_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_level_name text,
  ADD COLUMN IF NOT EXISTS granted_pct numeric,
  ADD COLUMN IF NOT EXISTS granted_advance_option text,
  ADD COLUMN IF NOT EXISTS writing_number text,
  ADD COLUMN IF NOT EXISTS invite_method text,
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

ALTER TABLE public.contracting_status_history
  ADD COLUMN IF NOT EXISTS change_kind text NOT NULL DEFAULT 'status',
  ADD COLUMN IF NOT EXISTS field text,
  ADD COLUMN IF NOT EXISTS old_value text,
  ADD COLUMN IF NOT EXISTS new_value text;

ALTER TABLE public.contracting_status_history DROP CONSTRAINT IF EXISTS contracting_status_history_change_kind_check;
ALTER TABLE public.contracting_status_history ADD CONSTRAINT contracting_status_history_change_kind_check CHECK (change_kind = ANY (ARRAY[
  'status','note','internal_note','writing_number','carrier_level','advance','invitation','effective_date'
]));