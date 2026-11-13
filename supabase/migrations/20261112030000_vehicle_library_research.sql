-- Researched vehicle details. A researcher (a person or an AI agent with web search) checks a model
-- against public sources and records family, series, years, type, fuel and engine, with the source
-- links in notes. Researched values are protected from the history refresh. Staff edits ('manual')
-- still outrank everything.
--
-- Precedence for the fields below: manual, then research, then history.

alter table public.vehicle_models drop constraint vehicle_models_attributes_source_check;
alter table public.vehicle_models add constraint vehicle_models_attributes_source_check
  check (attributes_source in ('history', 'research', 'manual'));

-- The history refresh no longer overwrites researched rows.
create or replace function public.apply_vehicle_library_history(p_rows jsonb, p_dry_run boolean default false)
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
  select count(*) into v_protected from pg_temp.hist h join public.vehicle_models m on m.netsuite_id = h.model_id
    where m.attributes_source in ('manual', 'research');
  select count(*) filter (where h.vehicle_class is not null), count(*) filter (where h.fuel_type is not null), count(*) filter (where h.year_from is not null)
    into v_classes, v_fuels, v_years
    from pg_temp.hist h join public.vehicle_models m on m.netsuite_id = h.model_id
    where m.attributes_source is null or m.attributes_source = 'history';

  if not p_dry_run then
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
      where m.netsuite_id = h.model_id and (m.attributes_source is null or m.attributes_source = 'history');
  end if;

  return jsonb_build_object('dryRun', p_dry_run, 'modelsMatched', v_matched, 'unmatched', v_unmatched,
    'protectedFromStaff', v_protected, 'classSet', v_classes, 'fuelSet', v_fuels, 'yearsSet', v_years);
end;
$$;

-- Loads researched values. Only fields the research is sure about are sent (nulls are left alone).
-- in_production true clears the end year. Rows staff have edited are skipped.
create function public.apply_vehicle_library_research(p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_applied int; v_skipped int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'research rows must be a non-empty JSON array' using errcode = '22023';
  end if;

  create temporary table pg_temp.research on commit drop as
    select x.id, nullif(btrim(x.family), '') as family, nullif(btrim(x.series), '') as series,
           x.year_from, x.year_to, x.in_production, x.vehicle_class, x.fuel_type,
           nullif(btrim(x.engine), '') as engine, nullif(btrim(x.notes), '') as notes
    from jsonb_to_recordset(p_rows) as x(id uuid, family text, series text, year_from int, year_to int, in_production boolean,
                                         vehicle_class text, fuel_type text, engine text, notes text);

  select count(*) into v_skipped from pg_temp.research r join public.vehicle_models m on m.id = r.id where m.attributes_source = 'manual';

  update public.vehicle_models m set
      family = coalesce(r.family, m.family),
      series = coalesce(r.series, m.series),
      year_from = coalesce(r.year_from, m.year_from),
      year_to = case when r.in_production then null else coalesce(r.year_to, m.year_to) end,
      vehicle_class = coalesce(r.vehicle_class, m.vehicle_class),
      fuel_type = coalesce(r.fuel_type, m.fuel_type),
      engine = coalesce(r.engine, m.engine),
      notes = coalesce(r.notes, m.notes),
      attributes_source = 'research'
    from pg_temp.research r
    where m.id = r.id and m.attributes_source is distinct from 'manual';
  get diagnostics v_applied = row_count;

  return jsonb_build_object('applied', v_applied, 'skippedManual', v_skipped);
end;
$$;

revoke all on function public.apply_vehicle_library_research(jsonb) from public, anon, authenticated;
grant execute on function public.apply_vehicle_library_research(jsonb) to service_role;

-- New column goes last so the view can be replaced in place.
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
  m.vehicle_count, m.evidence_vehicles, m.attributes_source,
  m.notes
from public.vehicle_models m
join public.vehicle_makes mk on mk.id = m.make_id
left join public.vehicle_classes c on c.code = m.vehicle_class
left join public.vehicle_fuel_types f on f.code = m.fuel_type;
