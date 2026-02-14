alter table public.profiles
  alter column phone_number drop not null,
  alter column first_name drop not null,
  alter column last_name drop not null;
