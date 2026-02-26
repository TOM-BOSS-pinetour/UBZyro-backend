alter table public.orders
  add column if not exists payment_amount numeric,
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists payment_provider text,
  add column if not exists payment_invoice_id text,
  add column if not exists payment_followup_link text,
  add column if not exists payment_transaction_id text,
  add column if not exists payment_paid_at timestamptz;

create index if not exists orders_payment_status_idx
  on public.orders (payment_status);
