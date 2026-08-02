-- ---------------------------------------------------------------------------
-- EVERY CARRIER AN AGENCY USES GETS THE LINK ROW THAT SAYS SO
--
-- `org_carriers` is what makes a carrier belong to an agency. Comp levels,
-- contracting requirements, the contracting method and the writing-number scope
-- all hang off `org_carriers.id`, and the team matrix is about to filter on it.
--
-- Two ways a carrier ended up in use without one:
--
--   `addCarrier` created a private `carriers` row and stopped there. The
--   carrier existed and was visible — RLS lets an agency see its own private
--   rows — but belonged to nobody. It could not hold a comp level, never
--   appeared under Carriers & Comp, and `listAvailableCarriers` cheerfully
--   offered it back as a carrier you could add.
--
--   Agencies have been contracting against catalogue carriers since long
--   before `org_carriers` existed. Those contracts are real; the link row was
--   never created retroactively.
--
-- This runs BEFORE the matrix starts filtering on `org_carriers`. In the other
-- order, every carrier without a link row disappears from the team matrix on
-- deploy — including the ones an agency added itself, which is the worst
-- possible first impression of a fix.
-- ---------------------------------------------------------------------------

-- 1. Private carriers an agency created. The owner column already says whose.
insert into public.org_carriers (organization_id, carrier_id, status, created_by)
select c.owner_organization_id, c.id, 'active', c.created_by
  from public.carriers c
 where c.is_private
   and c.owner_organization_id is not null
on conflict (organization_id, carrier_id) do nothing;

-- 2. Catalogue carriers an agency is already contracted with.
--
-- Evidence of use is a `contract_requests` row, which is the appointment
-- record. Anything an agency holds a contract against is a carrier it uses,
-- whatever the reason the link row is missing.
insert into public.org_carriers (organization_id, carrier_id, status)
select distinct cr.organization_id, cr.carrier_id, 'active'
  from public.contract_requests cr
 where cr.organization_id is not null
   and cr.carrier_id is not null
on conflict (organization_id, carrier_id) do nothing;

-- 3. Carriers an agency has entered its own commission grid for.
--
-- Somebody typed those rates in by hand or checked an extraction. That is a
-- carrier the agency uses even if nobody is contracted yet.
insert into public.org_carriers (organization_id, carrier_id, status)
select distinct g.organization_id, g.carrier_id, 'active'
  from public.commission_grids g
 where g.organization_id is not null
   and g.carrier_id is not null
on conflict (organization_id, carrier_id) do nothing;

notify pgrst, 'reload schema';
