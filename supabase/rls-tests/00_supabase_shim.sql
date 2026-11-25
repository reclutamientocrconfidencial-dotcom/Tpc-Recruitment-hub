-- =====================================================================
-- SOLO PARA PRUEBAS LOCALES EN POSTGRES "PURO" (sin Supabase).
-- Emula los objetos mínimos que Supabase provee: roles, esquema auth,
-- auth.users y auth.uid(). NO se ejecuta en Supabase.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Claims del JWT (incluye «aal»: aal1 contraseña, aal2 con verificación en dos pasos)
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Factores de verificación en dos pasos (subconjunto de columnas de Supabase Auth)
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null default 'verified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supabase otorga por defecto privilegios en public a estos roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
