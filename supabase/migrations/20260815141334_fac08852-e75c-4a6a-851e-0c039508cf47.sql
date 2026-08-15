create or replace function public.delete_org_carrier_cascade(
  _org uuid,
  _org_carrier uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _carrier uuid;
  _grids int := 0;
  _levels int := 0;
  _mappings int := 0;
  _methods int := 0;
  _requirements int := 0;
  _aliases int := 0;
begin
  select carrier_id into _carrier
  from public.org_carriers
  where id = _org_carrier and organization_id = _org;

  if _carrier is null then
    raise exception 'That carrier is not in your directory';
  end if;

  delete from public.agency_level_carrier_mappings
  where organization_id = _org and org_carrier_id = _org_carrier;
  get diagnostics _mappings = row_count;

  delete from public.carrier_comp_levels
  where organization_id = _org and org_carrier_id = _org_carrier;
  get diagnostics _levels = row_count;

  delete from public.org_carrier_methods
  where organization_id = _org and org_carrier_id = _org_carrier;
  get diagnostics _methods = row_count;

  delete from public.carrier_requirements
  where organization_id = _org and org_carrier_id = _org_carrier;
  get diagnostics _requirements = row_count;

  delete from public.commission_grids
  where organization_id = _org and carrier_id = _carrier;
  get diagnostics _grids = row_count;

  delete from public.carrier_aliases
  where organization_id = _org and carrier_id = _carrier;
  get diagnostics _aliases = row_count;

  delete from public.org_carriers
  where id = _org_carrier and organization_id = _org;

  return jsonb_build_object(
    'grids', _grids,
    'levels', _levels,
    'mappings', _mappings,
    'methods', _methods,
    'requirements', _requirements,
    'aliases', _aliases
  );
end;
$$;

revoke all on function public.delete_org_carrier_cascade(uuid, uuid) from public;
grant execute on function public.delete_org_carrier_cascade(uuid, uuid) to service_role;