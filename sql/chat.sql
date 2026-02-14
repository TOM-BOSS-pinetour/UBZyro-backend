create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_profile_id uuid not null references public.profiles(id) on delete cascade,
  worker_profile_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists conversations_order_id_idx
  on public.conversations (order_id);

create index if not exists conversations_user_profile_id_idx
  on public.conversations (user_profile_id);

create index if not exists conversations_worker_profile_id_idx
  on public.conversations (worker_profile_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  attachment_urls text[] not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

create index if not exists messages_sender_profile_id_idx
  on public.messages (sender_profile_id);

create index if not exists messages_created_at_idx
  on public.messages (created_at);
