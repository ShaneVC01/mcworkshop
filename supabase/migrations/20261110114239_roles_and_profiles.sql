-- RECONSTRUCTED. This change was applied directly to the McWorkshop project on 10/11/2026 11:42,
-- outside this repository. The file was rebuilt on 12/11/2026 from the live definitions so the repo
-- matches the remote migration history and a fresh database can be built. Do not edit it.

create type public.app_role as enum ('admin', 'manager', 'mechanic', 'executive');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.user_roles (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  role     public.app_role not null,
  constraint user_roles_user_id_role_key unique (user_id, role)
);

create function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$function$;

create function public.update_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin new.updated_at = now(); return new; end $function$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, email) values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'mechanic');
  return new;
end $function$;
