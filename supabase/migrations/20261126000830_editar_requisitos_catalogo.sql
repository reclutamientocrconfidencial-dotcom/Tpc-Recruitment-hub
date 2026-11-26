-- =====================================================================
-- TPC Recruitment Hub — Migración 0830: edición del catálogo de requisitos.
--
--   · Historial de cambios (nombre, categoría, escala, descripción) con
--     valores anteriores y nuevos, quién y cuándo. Solo lo escribe la BD.
--   · Los requisitos ya configurados (clientes, puestos, vacantes) reciben
--     el nuevo nombre y categoría automáticamente.
--   · La escala no se puede cambiar mientras algún requisito configurado
--     exija un nivel mínimo de la escala anterior (evita niveles inválidos).
--
-- Incremental: no modifica migraciones anteriores ni elimina datos.
-- Permisos: sin cambios (editar el catálogo = admin y coordinador, RLS 0810).
-- Verificación: supabase/verification/0830_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- 1) Historial (el catálogo no contiene datos personales)
create table public.requirement_catalog_history (
  id                     uuid primary key default gen_random_uuid(),
  requirement_id         uuid not null references public.requirement_catalog (id) on delete restrict,
  changed_at             timestamptz not null default now(),
  changed_by             uuid references public.profiles (id) on delete set null,
  old_name               text,
  new_name               text,
  old_category           public.requirement_category,
  new_category           public.requirement_category,
  old_scale_id           uuid references public.proficiency_scales (id) on delete restrict,
  new_scale_id           uuid references public.proficiency_scales (id) on delete restrict,
  old_description        text,
  new_description        text,
  old_is_active          boolean,
  new_is_active          boolean,
  templates_updated      integer not null default 0
);
comment on table public.requirement_catalog_history is 'Historial de cambios del catálogo de requisitos (escrito solo por la BD).';
create index requirement_catalog_history_req_idx on public.requirement_catalog_history (requirement_id, changed_at desc);

alter table public.requirement_catalog_history enable row level security;
alter table public.requirement_catalog_history force row level security;
revoke all on public.requirement_catalog_history from anon, authenticated;
grant select on public.requirement_catalog_history to authenticated;
create policy "requirement_catalog_history: leer (admin, coord)"
  on public.requirement_catalog_history for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));
-- Sin políticas de INSERT/UPDATE/DELETE: el historial es inalterable desde la API.

-- 2) Antes de actualizar: proteger los niveles mínimos ya configurados
create or replace function private.requirement_catalog_guard_scale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.scale_id is distinct from old.scale_id then
    select count(*) into v_count
    from public.requirement_templates t
    where t.catalog_requirement_id = new.id and t.min_level_id is not null;
    if v_count > 0 then
      raise exception 'No se puede cambiar la escala del requisito: % requisito(s) configurado(s) exigen un nivel mínimo de la escala actual. Quíteles el nivel o cree un requisito nuevo.', v_count
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger requirement_catalog_guard_scale
  before update on public.requirement_catalog
  for each row execute function private.requirement_catalog_guard_scale();

-- 3) Después de actualizar: propagar a los requisitos configurados y registrar el historial
create or replace function private.requirement_catalog_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if new.name is not distinct from old.name
     and new.category is not distinct from old.category
     and new.scale_id is not distinct from old.scale_id
     and new.description is not distinct from old.description
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  if new.name is distinct from old.name or new.category is distinct from old.category then
    -- El trigger de sincronización (0810) copia el nombre y la categoría del catálogo.
    update public.requirement_templates t
       set requirement = new.name, category = new.category
     where t.catalog_requirement_id = new.id;
    get diagnostics v_updated = row_count;
  end if;

  insert into public.requirement_catalog_history
    (requirement_id, changed_by, old_name, new_name, old_category, new_category,
     old_scale_id, new_scale_id, old_description, new_description, old_is_active, new_is_active, templates_updated)
  values
    (new.id, auth.uid(), old.name, new.name, old.category, new.category,
     old.scale_id, new.scale_id, old.description, new.description, old.is_active, new.is_active, v_updated);
  return new;
end;
$$;

create trigger requirement_catalog_after_update
  after update on public.requirement_catalog
  for each row execute function private.requirement_catalog_after_update();

revoke all on function private.requirement_catalog_guard_scale() from public, authenticated;
revoke all on function private.requirement_catalog_after_update() from public, authenticated;
