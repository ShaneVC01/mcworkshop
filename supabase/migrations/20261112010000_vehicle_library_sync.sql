-- Vehicle library sync and read model.
--   sync_vehicle_library: one transaction that upserts makes and models read from NetSuite.
--     Called only by the vehicle-library-sync Edge Function (service role).
--   vehicle_library: adds base_model (new column goes last so the view can be replaced in place).
--   vehicle_make_summary: makes with model counts, for the filter list.

create or replace function public.sync_vehicle_library(p_makes jsonb, p_models jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_make_in int; v_make_new int; v_make_upd int; v_make_off int;
  v_model_in int; v_model_new int; v_model_upd int; v_model_off int; v_model_skip int;
begin
  if jsonb_typeof(p_makes) <> 'array' or jsonb_typeof(p_models) <> 'array' then
    raise exception 'makes and models must be JSON arrays' using errcode = '22023';
  end if;
  -- An empty fetch must never deactivate the whole library.
  if jsonb_array_length(p_makes) = 0 or jsonb_array_length(p_models) = 0 then
    raise exception 'refusing to sync an empty list' using errcode = '22023';
  end if;

  create temporary table pg_temp.src_makes on commit drop as
    select x.id, btrim(x.name) as name, nullif(btrim(x.abbreviation), '') as abbreviation,
           coalesce(x.inactive, false) as inactive, x.modified
    from jsonb_to_recordset(p_makes) as x(id text, name text, abbreviation text, inactive boolean, modified timestamptz)
    where x.id is not null and btrim(coalesce(x.name, '')) <> '';

  create temporary table pg_temp.src_models on commit drop as
    select x.id, btrim(x.name) as name, nullif(btrim(x.base_model), '') as base_model,
           nullif(btrim(x.abbreviation), '') as abbreviation, x.make_id,
           coalesce(x.inactive, false) as inactive, x.modified
    from jsonb_to_recordset(p_models) as x(id text, name text, base_model text, abbreviation text, make_id text, inactive boolean, modified timestamptz)
    where x.id is not null and btrim(coalesce(x.name, '')) <> '' and x.make_id is not null
      and x.make_id in (select m.id from pg_temp.src_makes m);

  select count(*) into v_make_in from pg_temp.src_makes;
  select count(*) into v_model_in from pg_temp.src_models;
  v_model_skip := jsonb_array_length(p_models) - v_model_in;

  select count(*) filter (where e.id is null), count(*) filter (where e.id is not null)
    into v_make_new, v_make_upd
    from pg_temp.src_makes s left join public.vehicle_makes e on e.netsuite_id = s.id;
  select count(*) filter (where e.id is null), count(*) filter (where e.id is not null)
    into v_model_new, v_model_upd
    from pg_temp.src_models s left join public.vehicle_models e on e.netsuite_id = s.id;
  select count(*) into v_make_off from public.vehicle_makes e
    where e.source = 'netsuite' and e.is_active and e.netsuite_id not in (select id from pg_temp.src_makes);
  select count(*) into v_model_off from public.vehicle_models e
    where e.source = 'netsuite' and e.is_active and e.netsuite_id not in (select id from pg_temp.src_models);

  if not p_dry_run then
    insert into public.vehicle_makes (name, abbreviation, source, netsuite_id, netsuite_modified_at, last_synced_at, is_active)
      select s.name, s.abbreviation, 'netsuite', s.id, s.modified, now(), not s.inactive from pg_temp.src_makes s
    on conflict (netsuite_id) where netsuite_id is not null do update
      set name = excluded.name, abbreviation = excluded.abbreviation, is_active = excluded.is_active,
          netsuite_modified_at = excluded.netsuite_modified_at, last_synced_at = excluded.last_synced_at;

    insert into public.vehicle_models (make_id, name, base_model, abbreviation, source, netsuite_id, netsuite_modified_at, last_synced_at, is_active)
      select mk.id, s.name, s.base_model, s.abbreviation, 'netsuite', s.id, s.modified, now(), not s.inactive
      from pg_temp.src_models s join public.vehicle_makes mk on mk.netsuite_id = s.make_id
    on conflict (netsuite_id) where netsuite_id is not null do update
      set make_id = excluded.make_id, name = excluded.name, base_model = excluded.base_model,
          abbreviation = excluded.abbreviation, is_active = excluded.is_active,
          netsuite_modified_at = excluded.netsuite_modified_at, last_synced_at = excluded.last_synced_at;

    update public.vehicle_makes e set is_active = false, last_synced_at = now()
      where e.source = 'netsuite' and e.is_active and e.netsuite_id not in (select id from pg_temp.src_makes);
    update public.vehicle_models e set is_active = false, last_synced_at = now()
      where e.source = 'netsuite' and e.is_active and e.netsuite_id not in (select id from pg_temp.src_models);
  end if;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'makes', jsonb_build_object('fetched', jsonb_array_length(p_makes), 'inserted', v_make_new, 'updated', v_make_upd, 'deactivated', v_make_off),
    'models', jsonb_build_object('fetched', jsonb_array_length(p_models), 'inserted', v_model_new, 'updated', v_model_upd, 'deactivated', v_model_off, 'skipped', v_model_skip)
  );
end;
$$;

revoke all on function public.sync_vehicle_library(jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_vehicle_library(jsonb, jsonb, boolean) to service_role;

create or replace view public.vehicle_library
with (security_invoker = true) as
select
  m.id,
  m.name,
  m.family,
  m.series,
  mk.id   as make_id,
  mk.name as make_name,
  m.year_from,
  m.year_to,
  m.vehicle_class,
  c.label as class_label,
  m.fuel_type,
  f.label as fuel_label,
  m.engine,
  m.source,
  m.is_active and mk.is_active as is_active,
  (m.vehicle_class is null)    as needs_review,
  m.last_synced_at,
  m.base_model
from public.vehicle_models m
join public.vehicle_makes mk on mk.id = m.make_id
left join public.vehicle_classes c on c.code = m.vehicle_class
left join public.vehicle_fuel_types f on f.code = m.fuel_type;

create view public.vehicle_make_summary
with (security_invoker = true) as
select
  mk.id,
  mk.name,
  mk.is_active,
  count(m.id) filter (where m.is_active) as active_models,
  count(m.id) as models
from public.vehicle_makes mk
left join public.vehicle_models m on m.make_id = mk.id
group by mk.id, mk.name, mk.is_active;

revoke all on public.vehicle_make_summary from anon, authenticated;
grant select on public.vehicle_make_summary to authenticated;
