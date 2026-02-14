alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy if not exists conversations_select_participants
  on public.conversations
  for select
  using (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  );

create policy if not exists conversations_insert_participants
  on public.conversations
  for insert
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.user_profile_id = user_profile_id
        and o.worker_profile_id = worker_profile_id
        and (o.user_profile_id = auth.uid() or o.worker_profile_id = auth.uid())
    )
  );

create policy if not exists conversations_update_participants
  on public.conversations
  for update
  using (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  )
  with check (
    auth.uid() = user_profile_id
    or auth.uid() = worker_profile_id
  );

create policy if not exists messages_select_participants
  on public.messages
  for select
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and (c.user_profile_id = auth.uid() or c.worker_profile_id = auth.uid())
    )
  );

create policy if not exists messages_insert_participants
  on public.messages
  for insert
  with check (
    sender_profile_id = auth.uid()
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and (c.user_profile_id = auth.uid() or c.worker_profile_id = auth.uid())
    )
  );

create policy if not exists messages_update_participants
  on public.messages
  for update
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and (c.user_profile_id = auth.uid() or c.worker_profile_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and (c.user_profile_id = auth.uid() or c.worker_profile_id = auth.uid())
    )
  );
