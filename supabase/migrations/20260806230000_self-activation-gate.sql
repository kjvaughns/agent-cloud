-- Agents may not put themselves live at a carrier by default.
--
-- An agent could open Add Carrier, choose "I have a writing number", type
-- anything into the box, and the contract went straight to `active` — for a
-- carrier the agency does not contract with, with a number nobody checked.
-- The owner saw it in Contracts at Agency scope as an accomplished fact.
--
-- `agents_may_request_contracts` already exists next to this and governs
-- whether an agent may *ask*. This governs whether they may *declare*, which
-- is the stronger claim and therefore defaults the other way.
--
-- FALSE by default, including for existing rows: an agency that has been
-- running without this gate has not opted into self-activation, it just was
-- not asked.

alter table public.org_contracting_settings
  add column if not exists agents_may_self_activate_carriers boolean not null default false;

comment on column public.org_contracting_settings.agents_may_self_activate_carriers is
  'When false (default) an agent reporting their own writing number creates a request for staff to confirm, rather than an active contract. When true the contract goes active but keeps source = self_reported until somebody verifies it.';
