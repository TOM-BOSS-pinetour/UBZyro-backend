create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid references public.profiles(id) on delete set null,
  worker_profile_id uuid references public.profiles(id) on delete set null,
  service_key text not null,
  service_label text,
  scheduled_date date not null,
  district text not null,
  khoroo text not null,
  address text,
  description text,
  urgency text not null default 'normal' check (urgency in ('normal','urgent')),
  status text not null default 'pending' check (
    status in ('pending','accepted','en_route','in_progress','completed','cancelled','rejected')
  ),
  attachment_urls text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_profile_id_idx
  on public.orders (user_profile_id);

create index if not exists orders_worker_profile_id_idx
  on public.orders (worker_profile_id);

create index if not exists orders_status_idx
  on public.orders (status);

create index if not exists orders_service_key_idx
  on public.orders (service_key);
