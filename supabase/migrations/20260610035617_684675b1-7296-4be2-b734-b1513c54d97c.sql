-- ============================================================
-- C1: Organizations + expanded roles (re-apply idempotently)
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin'  BEFORE 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agency_owner' BEFORE 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff'        AFTER  'agent';
