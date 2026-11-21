-- =====================================================================
-- Migración 0200: perfiles de usuario, roles y funciones de autorización
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.app_role not null default 'consulta',
  is_active   boolean not null default true,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada usuario interno del ATS. El rol determina sus permisos.';

create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Funciones de autorización (SECURITY DEFINER para evitar recursión RLS)
-- ---------------------------------------------------------------------

-- Rol del usuario autenticado (NULL si no existe o está inactivo)
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

-- ¿El usuario autenticado tiene alguno de los roles indicados?
create or replace function private.has_any_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (roles), false)
$$;

-- ¿El usuario autenticado es un usuario interno activo?
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.has_any_role(public.app_role[]) from public;
revoke all on function private.is_active_user() from public;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;
grant execute on function private.is_active_user() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Alta automática del perfil al registrarse un usuario en Supabase Auth.
-- Principio de mínimo privilegio: todo usuario nuevo entra como 'consulta'.
-- El rol solo puede elevarlo un administrador.
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Protección contra escalamiento de privilegios: solo un admin puede
-- cambiar role, is_active o email de un perfil. Las operaciones con la
-- clave service_role (auth.uid() nulo, rol de BD service_role/postgres)
-- quedan permitidas para tareas administrativas.
-- ---------------------------------------------------------------------
create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email
      or new.id is distinct from old.id)
     and auth.uid() is not null
     and not private.has_any_role('admin') then
    raise exception 'No autorizado: solo un administrador puede modificar rol, estado o correo'
      using errcode = '42501';
  end if;

  -- Un administrador no puede quitarse a sí mismo el rol admin ni desactivarse
  if auth.uid() is not null and old.id = auth.uid() and old.role = 'admin'
     and (new.role <> 'admin' or not new.is_active) then
    raise exception 'Un administrador no puede degradarse ni desactivarse a sí mismo'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function private.protect_profile_privileges();
