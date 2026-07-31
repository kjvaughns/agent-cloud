-- ---------------------------------------------------------------------------
-- Make sure contract_status has 'assigned'.
--
-- 20260604260000_assigned_contract_status.sql already adds it, and that
-- migration is correct — it applies cleanly against a database built from this
-- repo. But the checked-in types.ts, which is generated from the live database
-- and is newer than that migration (it contains usage_events, added on 30
-- July), does not list 'assigned' among the enum's values. So there is real
-- doubt about whether it ever ran in production.
--
-- It matters because the invite writes contract_requests.status = 'assigned'
-- when carriers are pre-assigned on a link. If the value is missing the insert
-- fails, and an agent joins with none of the carriers their upline chose for
-- them.
--
-- This is idempotent and costs nothing if the value is already there. Cheaper
-- than being wrong about it.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'contract_status' AND n.nspname = 'public'
  ) THEN
    -- IF NOT EXISTS keeps this safe to re-run. Adding a value is allowed inside
    -- a transaction on PostgreSQL 12+; nothing here uses the value afterwards,
    -- which is the case that is not allowed.
    ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'assigned' BEFORE 'requested';
  ELSE
    CREATE TYPE public.contract_status AS ENUM (
      'assigned', 'requested', 'submitted', 'processing', 'issue', 'active', 'rejected'
    );
  END IF;
END $$;
