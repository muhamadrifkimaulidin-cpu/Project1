-- =====================================================================
-- Tiruan minimal Supabase (auth + storage) untuk menguji skema di PostgreSQL biasa.
-- HANYA untuk uji lokal (supabase/tests/run_local.sh). JANGAN jalankan di Supabase.
-- =====================================================================
-- role bersifat global di cluster; buat hanya jika belum ada
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id    uuid primary key,
  email text,
  aud   text,
  role  text
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid,
  owner_id  text,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant all on all tables in schema storage to anon, authenticated;
-- Supabase memberi semua hak tabel public ke anon/authenticated lewat default privileges
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Tiruan pg_net & Vault (migrasi 006): http_post hanya mencatat permintaan ke net.log_uji
create schema net;
create table net.log_uji (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$
  insert into net.log_uji (url, body, headers) values (url, body, headers) returning id
$$;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
