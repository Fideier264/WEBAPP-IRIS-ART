-- Cached iris text analysis from Edge Function `iris-analyze` (SHA-256 of downloaded image bytes).
-- Access: service role only (Edge Functions). RLS enabled with no policies blocks anon/authenticated JWT.

create table if not exists public.eye_profiles (
  id uuid primary key default gen_random_uuid(),
  image_fingerprint text not null unique,
  analysis jsonb not null,
  gemini_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eye_profiles_image_fingerprint_idx on public.eye_profiles (image_fingerprint);

alter table public.eye_profiles enable row level security;

comment on table public.eye_profiles is 'Server cache: sanitized iris-analyze JSON keyed by SHA-256 of input image bytes.';
