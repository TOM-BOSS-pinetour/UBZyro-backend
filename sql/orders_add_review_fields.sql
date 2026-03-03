alter table public.orders
  add column if not exists review_rating smallint,
  add column if not exists review_comment text,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  alter table public.orders
    add constraint orders_review_rating_range
    check (review_rating is null or review_rating between 1 and 5);
exception
  when duplicate_object then null;
end $$;

create index if not exists orders_worker_review_rating_idx
  on public.orders (worker_profile_id, review_rating);
