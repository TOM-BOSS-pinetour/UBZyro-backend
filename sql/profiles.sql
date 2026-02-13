create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user','worker')),
  email text not null,
  phone_number text not null,
  first_name text not null,
  last_name text not null,
  work_types text[],
  service_area text[],
  created_at timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_worker_required;

alter table public.profiles
  add constraint profiles_worker_required
  check (
    role <> 'worker' OR (
      work_types is not null and array_length(work_types, 1) >= 1
      and service_area is not null and array_length(service_area, 1) >= 1
    )
  );

alter table public.profiles
  drop constraint if exists profiles_user_forbid;

alter table public.profiles
  add constraint profiles_user_forbid
  check (
    role <> 'user' OR (
      work_types is null and service_area is null
    )
  );
