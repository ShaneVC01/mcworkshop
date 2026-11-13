-- Exports the whole vehicle library as one JSON document for a research agent.
-- Run in the Supabase SQL editor (project McWorkshop) and copy the single result cell into a .json file.
-- Read only. No customer data: makes, models and their attributes only.
select jsonb_pretty(jsonb_agg(row order by row->>'make', row->>'model')) as vehicle_library
from (
  select jsonb_build_object(
    'id',                m.id,
    'make',              mk.name,
    'model',             m.name,
    'base_model',        m.base_model,
    'family',            m.family,
    'series',            m.series,
    'year_from',         m.year_from,
    'year_to',           m.year_to,
    'vehicle_class',     m.vehicle_class,
    'fuel_type',         m.fuel_type,
    'engine',            m.engine,
    'is_active',         (m.is_active and mk.is_active),
    'workshop_vehicles', m.vehicle_count,
    'data_source',       m.attributes_source,
    'notes',             m.notes,
    'missing', to_jsonb(array_remove(array[
      case when m.family        is null then 'family' end,
      case when m.series        is null then 'series' end,
      case when m.year_from     is null then 'year_from' end,
      case when m.year_to       is null then 'year_to' end,
      case when m.vehicle_class is null then 'vehicle_class' end,
      case when m.fuel_type     is null then 'fuel_type' end,
      case when m.engine        is null then 'engine' end
    ], null))
  ) as row
  from public.vehicle_models m
  join public.vehicle_makes mk on mk.id = m.make_id
) t;
