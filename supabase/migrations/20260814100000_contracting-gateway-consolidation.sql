-- ---------------------------------------------------------------------------
-- ONE ANSWER TO "WHERE DOES THIS CARRIER'S PAPERWORK GO"
--
-- An external contracting URL has lived in three places at once:
--
--   org_carriers.surelc_url / contracting_portal_url / invitation_link
--     — three loose columns from the first contracting-ops migration
--   org_carrier_methods.target_url
--     — the real model, added in the same migration: one row per method, with
--       a vocabulary, applies_to scoping, and a one-default-per-carrier index
--   carriers.agent_portal_url
--     — the original May-era catalog column, untouched here
--
-- The packet builder consulted both of the first two and trusted a different
-- one per method kind; `invitation_link` never had a UI that could set it at
-- all. Two stores for one fact, and the fact was "where an agent's contracting
-- paperwork is sent" — not a place to have two answers.
--
-- The application now treats method rows as the store: the carrier dialog no
-- longer offers the loose URL fields, the Submission methods editor is the one
-- write path, and the handoff/packet resolvers read methods first with the
-- loose columns as fallback. This migration moves the existing data across so
-- the fallback stops carrying live weight:
--
--   For each org_carrier with a URL in a loose column and NO method row of
--   that kind, create the method row. Rows that already exist are left
--   entirely alone — an operator who configured a method with instructions
--   and applies_to scoping must not have it duplicated or touched.
--
--   Where the carrier ends up with method rows but no default, promote
--   exactly one: surelc first (it is the door most agencies send agents
--   through), then carrier_portal, then invitation_link. The partial unique
--   index idx_org_carrier_methods_one_default enforces "at most one", so the
--   promotion is written to respect it rather than trip over it.
--
-- The loose columns are NOT dropped. Reads still fall back to them until this
-- has been applied and eyeballed, and dropping columns the deployed code still
-- selects would fail every query that names them. They are commented as
-- deprecated; a later migration removes them once nothing reads them.
-- ---------------------------------------------------------------------------

-- Backfill: one row per (org_carrier, kind) that has a legacy URL and no row.
insert into public.org_carrier_methods
  (organization_id, org_carrier_id, method, target_url, is_default, sort_order)
select oc.organization_id, oc.id, kind.method, kind.url, false,
       case kind.method when 'surelc' then 0 when 'carrier_portal' then 1 else 2 end
  from public.org_carriers oc
 cross join lateral (
   values ('surelc', oc.surelc_url),
          ('carrier_portal', oc.contracting_portal_url),
          ('invitation_link', oc.invitation_link)
 ) as kind(method, url)
 where kind.url is not null
   and btrim(kind.url) <> ''
   and not exists (
     select 1 from public.org_carrier_methods m
      where m.org_carrier_id = oc.id and m.method = kind.method
   );

-- Promote one default where none exists. Distinct-on picks the best kind per
-- carrier; the NOT EXISTS guard keeps the partial unique index happy and makes
-- a re-run a no-op.
update public.org_carrier_methods m
   set is_default = true
  from (
    select distinct on (org_carrier_id) id
      from public.org_carrier_methods
     order by org_carrier_id,
              case method when 'surelc' then 0 when 'carrier_portal' then 1
                          when 'invitation_link' then 2 else 3 end,
              sort_order, created_at
  ) pick
 where m.id = pick.id
   and not exists (
     select 1 from public.org_carrier_methods d
      where d.org_carrier_id = m.org_carrier_id and d.is_default
   );

comment on column public.org_carriers.surelc_url is
  'Deprecated: gateways live in org_carrier_methods. Read-only fallback until the backfill is verified; nothing writes this any more.';
comment on column public.org_carriers.contracting_portal_url is
  'Deprecated: gateways live in org_carrier_methods. Read-only fallback until the backfill is verified; nothing writes this any more.';
comment on column public.org_carriers.invitation_link is
  'Deprecated: gateways live in org_carrier_methods. Read-only fallback until the backfill is verified; nothing writes this any more.';

notify pgrst, 'reload schema';
