alter table public.orders enable row level security;

create policy if not exists orders_select_participants
  on public.orders
  for select
  using (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  );

create policy if not exists orders_insert_owner
  on public.orders
  for insert
  with check (
    auth.uid() = user_profile_id
  );

create policy if not exists orders_update_participants
  on public.orders
  for update
  using (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  )
  with check (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  );
