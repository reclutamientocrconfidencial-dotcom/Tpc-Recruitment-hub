-- =====================================================================
-- TPC Recruitment Hub — Puerta S1: seguridad previa a datos reales.
-- Migración 0900:
--   1. Verificación en dos pasos (TOTP) exigible para todo usuario interno:
--      cuando está activada, la base de datos solo reconoce el rol de quien
--      inició sesión con nivel aal2. Sin aal2 no se ve ningún dato.
--   2. Registro de accesos (consultas de datos sensibles, descargas,
--      exportaciones, importaciones): solo se agrega, nunca se modifica.
--   3. Estado de verificación en dos pasos de los usuarios (solo admin).
--
-- Incremental y compatible: la exigencia inicia DESACTIVADA; un
-- administrador la activa cuando todos los usuarios la hayan configurado.
-- Verificación: supabase/verification/0900_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuración de seguridad (una sola fila)
-- ---------------------------------------------------------------------
create table public.security_settings (
  id            uuid primary key default gen_random_uuid(),
  singleton     boolean not null default true unique check (singleton),
  mfa_required  boolean not null default false,
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now()
);
comment on table public.security_settings is 'Parámetros de seguridad globales (fila única).';
insert into public.security_settings (mfa_required) values (false);

-- ¿La sesión cumple la verificación en dos pasos exigida?
-- (Sin JWT —SQL Editor, tareas administrativas— no aplica.)
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
      or not coalesce((select s.mfa_required from public.security_settings s limit 1), false)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke all on function private.mfa_satisfied() from public;
grant execute on function private.mfa_satisfied() to authenticated, service_role;

-- Punto central de autorización (0200): ahora también exige la verificación
-- en dos pasos cuando está activada. Todas las políticas RLS dependen de él.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active and private.mfa_satisfied()
$$;

alter table public.security_settings enable row level security;
alter table public.security_settings force row level security;
revoke all on public.security_settings from anon, authenticated;
grant select, update (mfa_required) on public.security_settings to authenticated;

-- Cualquier usuario con sesión puede saber si se exige (para guiarlo a configurarla).
create policy "security_settings: leer (con sesión)"
  on public.security_settings for select to authenticated
  using (auth.uid() is not null);
-- Solo un administrador que YA verificó su identidad en dos pasos puede cambiarla
-- (evita activarla sin tenerla y quedar sin acceso).
create policy "security_settings: editar (admin con aal2)"
  on public.security_settings for update to authenticated
  using ((select private.has_any_role('admin')) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  with check ((select private.has_any_role('admin')) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2');

create or replace function private.security_settings_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
create trigger security_settings_stamp before update on public.security_settings
  for each row execute function private.security_settings_stamp();
create trigger security_settings_audit after update on public.security_settings
  for each row execute function private.write_audit_log();
revoke all on function private.security_settings_stamp() from public, authenticated;

-- ---------------------------------------------------------------------
-- 2) Registro de accesos (sin valores personales: solo qué, quién, cuándo y por qué)
-- ---------------------------------------------------------------------
create table public.access_logs (
  id          bigint generated always as identity primary key,
  action      text not null check (action in ('ver_dato_sensible', 'descargar', 'exportar', 'importar')),
  resource    text not null check (char_length(resource) between 1 and 60),
  record_id   uuid,
  reason      text check (reason is null or char_length(reason) <= 300),
  item_count  integer check (item_count is null or item_count >= 0),
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.access_logs is 'Registro inalterable de accesos a datos sensibles, descargas, exportaciones e importaciones.';
create index access_logs_created_idx on public.access_logs (created_at desc);
create index access_logs_actor_idx on public.access_logs (actor_id, created_at desc);
create index access_logs_resource_idx on public.access_logs (resource, record_id);

alter table public.access_logs enable row level security;
alter table public.access_logs force row level security;
revoke all on public.access_logs from anon, authenticated;
grant select on public.access_logs to authenticated;
create policy "access_logs: lectura solo admin"
  on public.access_logs for select to authenticated
  using ((select private.has_any_role('admin')));
-- Sin INSERT/UPDATE/DELETE desde la API: solo mediante public.log_access().

-- Registra un acceso. El autor es siempre el usuario de la sesión (no suplantable).
create or replace function public.log_access(
  p_action text,
  p_resource text,
  p_record_id uuid default null,
  p_reason text default null,
  p_item_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values (p_action, p_resource, p_record_id, nullif(trim(p_reason), ''), p_item_count, auth.uid());
end;
$$;
revoke all on function public.log_access(text, text, uuid, text, integer) from public, anon;
grant execute on function public.log_access(text, text, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Estado de la verificación en dos pasos por usuario (solo admin)
-- ---------------------------------------------------------------------
create or replace function public.users_mfa_status()
returns table (user_id uuid, mfa_enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_any_role('admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select p.id,
           exists (select 1 from auth.mfa_factors f
                   where f.user_id = p.id and f.factor_type::text = 'totp' and f.status::text = 'verified')
    from public.profiles p;
end;
$$;
revoke all on function public.users_mfa_status() from public, anon;
grant execute on function public.users_mfa_status() to authenticated;
