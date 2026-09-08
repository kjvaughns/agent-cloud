-- 1. Downline walk: inherit the agency when the child has none recorded.
CREATE OR REPLACE FUNCTION public.is_in_downline(_upline uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with recursive up as (
    select organization_id from public.profiles where id = _upline
  ), downline as (
    select p.id, 1 as depth
      from public.profiles p
     where p.upline_id = _upline
       and p.id <> _upline
       and (
         (select organization_id from up) is null
         or p.organization_id is null
         or p.organization_id is not distinct from (select organization_id from up)
       )
    union
    select p.id, d.depth + 1
      from public.profiles p
      join downline d on p.upline_id = d.id
     where d.depth < 50
       and p.id <> d.id
       and (
         (select organization_id from up) is null
         or p.organization_id is null
         or p.organization_id is not distinct from (select organization_id from up)
       )
  )
  select case
    when exists (
      select 1 from public.profiles
       where id = _upline and status in ('inactive','terminated')
    ) then false
    else _target = _upline or exists (select 1 from downline where id = _target)
  end
$function$;

-- 2. Positions ladder: readable through membership, the profile column, or an upline's agency.
CREATE OR REPLACE FUNCTION public.org_of_my_chain(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with recursive me as (
    select p.id, p.upline_id, p.organization_id, 1 as depth
      from public.profiles p where p.id = auth.uid()
    union all
    select p.id, p.upline_id, p.organization_id, m.depth + 1
      from public.profiles p join me m on p.id = m.upline_id
     where m.depth < 50
  )
  select exists (select 1 from me where organization_id = _org)
      or exists (
        select 1 from public.organization_memberships om
         where om.profile_id = auth.uid() and om.status = 'active'
           and om.organization_id = _org
      )
$function$;

DROP POLICY IF EXISTS agency_levels_read ON public.agency_levels;
CREATE POLICY agency_levels_read ON public.agency_levels
  FOR SELECT TO authenticated
  USING (public.org_of_my_chain(organization_id));

-- 3. One-time repair: agents with no agency recorded inherit their upline's.
WITH RECURSIVE chain AS (
  SELECT p.id, p.upline_id, p.organization_id
    FROM public.profiles p
   WHERE p.organization_id IS NOT NULL
  UNION ALL
  SELECT c2.id, c2.upline_id, ch.organization_id
    FROM public.profiles c2
    JOIN chain ch ON c2.upline_id = ch.id
   WHERE c2.organization_id IS NULL
)
UPDATE public.profiles p
   SET organization_id = c.organization_id
  FROM chain c
 WHERE p.id = c.id
   AND p.organization_id IS NULL
   AND p.status NOT IN ('inactive','terminated');

INSERT INTO public.organization_memberships (organization_id, profile_id, status)
SELECT p.organization_id, p.id, 'active'
  FROM public.profiles p
 WHERE p.organization_id IS NOT NULL
   AND p.status NOT IN ('inactive','terminated')
   AND NOT EXISTS (
     SELECT 1 FROM public.organization_memberships om
      WHERE om.profile_id = p.id AND om.organization_id = p.organization_id
   )
ON CONFLICT DO NOTHING;