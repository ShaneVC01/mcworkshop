-- Vehicle library: makes and models, read from NetSuite and extended with app owned attributes.
--
-- Ownership rules (the sync Edge Function must follow these):
--   Sync owned (overwritten on every sync for source = 'netsuite' rows):
--     vehicle_makes:  name, abbreviation, is_active, netsuite_modified_at, last_synced_at
--     vehicle_models: name, base_model, make_id, abbreviation, is_active, netsuite_modified_at, last_synced_at
--   App owned (never touched by the sync): family, series, year_from, year_to, vehicle_class,
--     fuel_type, engine, notes.
--
-- NetSuite facts this design handles (checked 12/11/2026 against 62 makes and 591 models):
--   - Names are not unique per make (for example two "RANGER RAPTOR" rows), so uniqueness is
--     enforced on the source id only.
--   - Some names carry stray spaces, so names must be trimmed before they are stored.
--   - Four models have no make. The sync skips them and reports the count in sync_runs.
--   - The model name often includes the trim ("FORTUNER GXL"). base_model keeps NetSuite's
--     separate model field ("FORTUNER") when it is filled in.
--   - Class and fuel are not held against a model in NetSuite, so they start empty and are
--     set by staff. Empty means "needs review".

-- Lookup tables rather than enums, so staff can add values without a migration.
create table public.vehicle_classes (
  code        text primary key check (code ~ '^[a-z0-9-]+$'),
  label       text not null check (btrim(label) <> ''),
  sort_order  integer not null default 0
);

create table public.vehicle_fuel_types (
  code        text primary key check (code ~ '^[a-z0-9-]+$'),
  label       text not null check (btrim(label) <> ''),
  sort_order  integer not null default 0
);

insert into public.vehicle_classes (code, label, sort_order) values
  ('4wd', '4WD', 1),
  ('passenger', 'Passenger car', 2),
  ('light-commercial', 'Light commercial', 3);

insert into public.vehicle_fuel_types (code, label, sort_order) values
  ('diesel', 'Diesel', 1),
  ('petrol', 'Petrol', 2),
  ('hybrid', 'Hybrid', 3),
  ('electric', 'Electric', 4);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.vehicle_makes (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (btrim(name) <> '' and name = btrim(name)),
  abbreviation          text,
  source                text not null default 'manual' check (source in ('netsuite', 'manual')),
  netsuite_id           text,
  netsuite_modified_at  timestamptz,
  last_synced_at        timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vehicle_makes_source_id check ((source = 'netsuite') = (netsuite_id is not null))
);

create unique index vehicle_makes_netsuite_id_key on public.vehicle_makes (netsuite_id) where netsuite_id is not null;
create index vehicle_makes_name_idx on public.vehicle_makes (lower(name));

create trigger vehicle_makes_touch before update on public.vehicle_makes
  for each row execute function public.touch_updated_at();

create table public.vehicle_models (
  id                    uuid primary key default gen_random_uuid(),
  make_id               uuid not null references public.vehicle_makes (id) on delete restrict,
  name                  text not null check (btrim(name) <> '' and name = btrim(name)),
  base_model            text check (base_model is null or (btrim(base_model) <> '' and base_model = btrim(base_model))),
  abbreviation          text,
  family                text check (family is null or btrim(family) <> ''),
  series                text check (series is null or btrim(series) <> ''),
  year_from             smallint check (year_from between 1900 and 2100),
  year_to               smallint check (year_to between 1900 and 2100),
  vehicle_class         text references public.vehicle_classes (code) on update cascade on delete restrict,
  fuel_type             text references public.vehicle_fuel_types (code) on update cascade on delete restrict,
  engine                text,
  notes                 text,
  source                text not null default 'manual' check (source in ('netsuite', 'manual')),
  netsuite_id           text,
  netsuite_modified_at  timestamptz,
  last_synced_at        timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vehicle_models_source_id check ((source = 'netsuite') = (netsuite_id is not null)),
  constraint vehicle_models_year_order check (year_to is null or year_from is null or year_from <= year_to)
);

create unique index vehicle_models_netsuite_id_key on public.vehicle_models (netsuite_id) where netsuite_id is not null;
create index vehicle_models_make_id_idx on public.vehicle_models (make_id);
create index vehicle_models_name_idx on public.vehicle_models (lower(name));

create trigger vehicle_models_touch before update on public.vehicle_models
  for each row execute function public.touch_updated_at();

-- One row per sync attempt. Counts only. Never store customer data or secrets here.
create table public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  entity          text not null check (btrim(entity) <> ''),
  status          text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  fetched         integer not null default 0 check (fetched >= 0),
  inserted        integer not null default 0 check (inserted >= 0),
  updated         integer not null default 0 check (updated >= 0),
  deactivated     integer not null default 0 check (deactivated >= 0),
  skipped         integer not null default 0 check (skipped >= 0),
  error_code      text,
  error_message   text,
  correlation_id  text
);

create index sync_runs_entity_started_idx on public.sync_runs (entity, started_at desc);

-- The list the Vehicle library screen reads. Runs with the caller's rights, so the policies below apply.
create view public.vehicle_library
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
  m.last_synced_at
from public.vehicle_models m
join public.vehicle_makes mk on mk.id = m.make_id
left join public.vehicle_classes c on c.code = m.vehicle_class
left join public.vehicle_fuel_types f on f.code = m.fuel_type;

-- Access. Row level security on everything. The library is shared reference data (no customer or
-- tenant data), so anyone who holds a staff role (a row in user_roles, any role) may read it.
-- Nobody signed in may write: changes go through Edge Functions or RPCs that check the caller's
-- role. sync_runs has no policy, so only the service role (Edge Functions) can read or write it.
alter table public.vehicle_classes   enable row level security;
alter table public.vehicle_fuel_types enable row level security;
alter table public.vehicle_makes     enable row level security;
alter table public.vehicle_models    enable row level security;
alter table public.sync_runs         enable row level security;

revoke all on public.vehicle_classes, public.vehicle_fuel_types, public.vehicle_makes,
  public.vehicle_models, public.sync_runs, public.vehicle_library from anon, authenticated;

grant select on public.vehicle_classes, public.vehicle_fuel_types, public.vehicle_makes,
  public.vehicle_models, public.vehicle_library to authenticated;

-- Staff means holding any role. Written as one expression so it is evaluated once per query.
create policy "Staff read vehicle classes" on public.vehicle_classes
  for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
create policy "Staff read fuel types" on public.vehicle_fuel_types
  for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
create policy "Staff read vehicle makes" on public.vehicle_makes
  for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));
create policy "Staff read vehicle models" on public.vehicle_models
  for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid())));

comment on table public.vehicle_makes is 'Vehicle makes. Read from NetSuite (source = netsuite) with manual additions for gaps.';
comment on table public.vehicle_models is 'Vehicle models. NetSuite owns name, base_model, make and active. The app owns family, series, years, class, fuel, engine and notes.';
comment on table public.sync_runs is 'One row per library sync attempt. Counts and error codes only.';
