-- Vehicle library enrichment from workshop history.
-- NetSuite does not say what type or fuel a model is, but its vehicle records and past jobs hold
-- strong hints. The vehicle-library-enrich function aggregates them (no customer data) and calls
-- apply_vehicle_library_history to fill what the evidence supports.
--
-- Staff always win: rows whose attributes_source is 'manual' are never overwritten. Rows filled
-- from history ('history') are refreshed on each run. Rows with no source are untouched by staff.

alter table public.vehicle_models
  add column vehicle_count     integer not null default 0 check (vehicle_count >= 0),
  add column evidence_vehicles integer check (evidence_vehicles is null or evidence_vehicles >= 0),
  add column attributes_source text check (attributes_source in ('history', 'manual'));

comment on column public.vehicle_models.vehicle_count is 'How many customer vehicles in NetSuite point at this model. A statistic, refreshed by the enrich function.';
comment on column public.vehicle_models.attributes_source is 'Who set class, fuel and years: history (derived from workshop records) or manual (staff). Manual is never overwritten.';

create function public.apply_vehicle_library_history(p_rows jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_matched int; v_classes int; v_fuels int; v_years int; v_protected int; v_unmatched int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'history rows must be a non-empty JSON array' using errcode = '22023';
  end if;

  create temporary table pg_temp.hist on commit drop as
    select x.model_id, greatest(coalesce(x.vehicles, 0), 0) as vehicles, x.vehicle_class, x.fuel_type,
           x.year_from, x.year_to, x.evidence
    from jsonb_to_recordset(p_rows) as x(model_id text, vehicles int, vehicle_class text, fuel_type text, year_from int, year_to int, evidence int)
    where x.model_id is not null;

  select count(*) into v_matched from pg_temp.hist h join public.vehicle_models m on m.netsuite_id = h.model_id;
  select count(*) into v_unmatched from pg_temp.hist h where not exists (select 1 from public.vehicle_models m where m.netsuite_id = h.model_id);
  select count(*) into v_protected from pg_temp.hist h join public.vehicle_models m on m.netsuite_id = h.model_id where m.attributes_source = 'manual';
  select count(*) filter (where h.vehicle_class is not null), count(*) filter (where h.fuel_type is not null), count(*) filter (where h.year_from is not null)
    into v_classes, v_fuels, v_years
    from pg_temp.hist h join public.vehicle_models m on m.netsuite_id = h.model_id
    where m.attributes_source is distinct from 'manual';

  if not p_dry_run then
    -- The count is a statistic, so it is always refreshed. Models nobody owns a vehicle of drop to zero.
    update public.vehicle_models m set vehicle_count = h.vehicles from pg_temp.hist h where m.netsuite_id = h.model_id;
    update public.vehicle_models m set vehicle_count = 0
      where m.source = 'netsuite' and m.vehicle_count <> 0 and m.netsuite_id not in (select model_id from pg_temp.hist);

    update public.vehicle_models m set
        vehicle_class = h.vehicle_class,
        fuel_type = h.fuel_type,
        year_from = h.year_from,
        year_to = h.year_to,
        evidence_vehicles = h.evidence,
        attributes_source = case when h.vehicle_class is not null or h.fuel_type is not null or h.year_from is not null then 'history' end
      from pg_temp.hist h
      where m.netsuite_id = h.model_id and m.attributes_source is distinct from 'manual';
  end if;

  return jsonb_build_object('dryRun', p_dry_run, 'modelsMatched', v_matched, 'unmatched', v_unmatched,
    'protectedFromStaff', v_protected, 'classSet', v_classes, 'fuelSet', v_fuels, 'yearsSet', v_years);
end;
$$;

revoke all on function public.apply_vehicle_library_history(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_vehicle_library_history(jsonb, boolean) to service_role;

-- New columns go last so the view can be replaced in place.
create or replace view public.vehicle_library
with (security_invoker = true) as
select
  m.id, m.name, m.family, m.series,
  mk.id as make_id, mk.name as make_name,
  m.year_from, m.year_to,
  m.vehicle_class, c.label as class_label,
  m.fuel_type, f.label as fuel_label,
  m.engine, m.source,
  m.is_active and mk.is_active as is_active,
  (m.vehicle_class is null) as needs_review,
  m.last_synced_at,
  m.base_model,
  m.vehicle_count, m.evidence_vehicles, m.attributes_source
from public.vehicle_models m
join public.vehicle_makes mk on mk.id = m.make_id
left join public.vehicle_classes c on c.code = m.vehicle_class
left join public.vehicle_fuel_types f on f.code = m.fuel_type;
