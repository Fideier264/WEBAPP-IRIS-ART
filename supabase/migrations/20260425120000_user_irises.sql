-- Cloud gallery for authenticated users: metadata + private Storage objects.

create table if not exists public.user_irises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  fingerprint text null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create unique index if not exists user_irises_user_fingerprint_uidx
  on public.user_irises (user_id, fingerprint)
  where fingerprint is not null;

create index if not exists user_irises_user_last_used_idx
  on public.user_irises (user_id, last_used_at desc);

alter table public.user_irises enable row level security;

create policy "user_irises_select_own"
  on public.user_irises for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_irises_insert_own"
  on public.user_irises for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_irises_update_own"
  on public.user_irises for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_irises_delete_own"
  on public.user_irises for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.user_irises is 'Per-user generated iris renderings; files live in Storage bucket user-irises.';

-- Private bucket for iris PNGs/JPEGs: paths must start with {auth.uid()}/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-irises',
  'user-irises',
  false,
  5242880,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "user_irises_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-irises'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user_irises_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-irises'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user_irises_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-irises'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-irises'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user_irises_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-irises'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
