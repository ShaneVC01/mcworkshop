-- RECONSTRUCTED. Applied directly to the McWorkshop project on 10/11/2026 11:43, outside this
-- repository. Rebuilt on 12/11/2026 from the live definitions. Do not edit it.

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;

create policy "Own profile read" on public.profiles
  for select to authenticated
  using ((auth.uid() = id) or public.has_role(auth.uid(), 'admin'));

create policy "Own profile update" on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Own roles read" on public.user_roles
  for select to authenticated
  using ((auth.uid() = user_id) or public.has_role(auth.uid(), 'admin'));

create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
