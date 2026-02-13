alter table public.profiles
  add column if not exists rating numeric(3,2),
  add column if not exists orders int,
  add column if not exists years int;
