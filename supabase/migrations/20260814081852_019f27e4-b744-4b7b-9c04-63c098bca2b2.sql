alter table public.commission_grids
  add column if not exists sort_order integer,
  add column if not exists level_sort integer;

comment on column public.commission_grids.sort_order is
  'Authored position of the product row in the grid editor. Null = no authored order; readers fall back to alphabetical.';
comment on column public.commission_grids.level_sort is
  'Authored position of the level column in the grid editor. Null = no authored order; readers fall back to rate magnitude.';

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