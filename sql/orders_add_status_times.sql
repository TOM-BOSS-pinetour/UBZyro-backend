alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists en_route_at timestamptz,
  add column if not exists in_progress_at timestamptz,
  add column if not exists completed_at timestamptz;
