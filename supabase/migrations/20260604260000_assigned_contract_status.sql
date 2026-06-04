-- Add 'assigned' status to contract_status enum.
-- Handles the case where the enum doesn't exist yet (fresh DB) or already exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    -- Enum exists — add the value if it isn't already there
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'assigned' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contract_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))) THEN
      ALTER TYPE public.contract_status ADD VALUE 'assigned' BEFORE 'requested';
    END IF;
  ELSE
    -- Enum doesn't exist yet — create it with all values including 'assigned'
    CREATE TYPE public.contract_status AS ENUM (
      'assigned', 'requested', 'submitted', 'processing', 'issue', 'active', 'rejected'
    );
  END IF;
END $$;
