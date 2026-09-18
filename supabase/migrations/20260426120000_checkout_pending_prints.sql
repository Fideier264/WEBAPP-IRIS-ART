-- Print URLs registered after Stripe Checkout opens (parallel upload).

create table if not exists public.checkout_pending_prints (
  session_id text primary key,
  print_file_url text not null,
  created_at timestamptz not null default now()
);

comment on table public.checkout_pending_prints is
  'Signed print URLs attached after create-checkout-session when artwork finishes uploading.';

create index if not exists checkout_pending_prints_created_at_idx
  on public.checkout_pending_prints (created_at);

alter table public.checkout_pending_prints enable row level security;
-- No client policies: service role only (register-checkout-print + stripe-webhook).
