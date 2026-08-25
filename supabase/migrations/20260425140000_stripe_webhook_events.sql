-- Idempotency for Stripe webhooks (avoid duplicate merchOne orders on retries).

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  session_id text null,
  merchone_order_id text null,
  created_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Processed Stripe webhook event IDs for IrisART checkout fulfillment.';

alter table public.stripe_webhook_events enable row level security;
-- No client policies: only service role (webhook) writes/reads.
