-- =====================================================================
-- TPC Recruitment Hub — Fase 2B
-- Migración 0820: requisiciones y vacantes.
--
--   · Puesto (catálogo), horario, prioridad y plazas cubiertas.
--   · Flujo de estados de requisiciones aplicado en la BD (aprobación).
--   · Vacantes solo desde requisiciones aprobadas o en proceso.
--   · Fecha de publicación automática y estado «cubierta» automático.
--   · Requisitos sugeridos para una vacante y duplicación de vacantes.
--
-- Incremental: no modifica migraciones anteriores ni elimina datos.
-- Verificación: supabase/verification/0820_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.requisitions
  add column position_id   uuid references public.job_positions (id) on delete restrict,
  add column work_schedule text check (work_schedule is null or char_length(work_schedule) <= 200),
  add column province      public.cr_province,
  add column modality      public.work_modality;

alter table public.vacancies
  add column position_id   uuid references public.job_positions (id) on delete restrict,
  add column work_schedule text check (work_schedule is null or char_length(work_schedule) <= 200),
  add column priority      public.priority_level not null default 'media',
  add column filled_count  integer not null default 0,
  add column source_vacancy_id uuid references public.vacancies (id) on delete set null,
  add constraint vacancies_filled_range check (filled_count >= 0 and filled_count <= openings);

comment on column public.vacancies.filled_count is 'Plazas cubiertas (en 2D se calculará desde las postulaciones contratadas).';
comment on column public.vacancies.source_vacancy_id is 'Vacante de origen cuando se creó por duplicación (trazabilidad).';

create index requisitions_position_idx on public.requisitions (position_id);
create index requisitions_target_date_idx on public.requisitions (target_date);
create index requisitions_title_trgm_idx on public.requisitions using gin (title extensions.gin_trgm_ops);
create index vacancies_position_idx on public.vacancies (position_id);
create index vacancies_closes_at_idx on public.vacancies (closes_at);
create index vacancies_title_trgm_idx on public.vacancies using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2) Flujo de estados de las requisiciones
--    borrador → pendiente_aprobacion → aprobada → en_proceso → cerrada
--    (cancelada desde cualquier estado activo; devolución a borrador;
--     reapertura de cerrada a en_proceso)
-- ---------------------------------------------------------------------
create or replace function private.requisition_transition_allowed(p_from public.requisition_status, p_to public.requisition_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('borrador'::public.requisition_status,             'pendiente_aprobacion'::public.requisition_status),
    ('borrador',             'cancelada'),
    ('pendiente_aprobacion', 'aprobada'),
    ('pendiente_aprobacion', 'borrador'),
    ('pendiente_aprobacion', 'cancelada'),
    ('aprobada',             'en_proceso'),
    ('aprobada',             'cerrada'),
    ('aprobada',             'cancelada'),
    ('en_proceso',           'cerrada'),
    ('en_proceso',           'cancelada'),
    ('cerrada',              'en_proceso')
  )
$$;

create or replace function private.requisition_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Usuarios de la aplicación: siempre inician el flujo. (Cargas administrativas sin sesión,
    -- como los datos ficticios de prueba, conservan el estado indicado.)
    if auth.uid() is not null and new.status not in ('borrador', 'pendiente_aprobacion') then
      raise exception 'Una requisición nueva debe iniciar en borrador o pendiente de aprobación' using errcode = '23514';
    end if;
    if auth.uid() is not null then
      new.approved_by := null;
      new.approved_at := null;
    end if;
    return new;
  end if;

  if not private.requisition_transition_allowed(old.status, new.status) then
    raise exception 'Cambio de estado no permitido: % → %', old.status, new.status using errcode = '23514';
  end if;

  if new.status = 'aprobada' and old.status <> 'aprobada' then
    if not private.has_any_role('admin', 'coordinador') and auth.uid() is not null then
      raise exception 'Solo administración o coordinación puede aprobar requisiciones' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status in ('borrador', 'pendiente_aprobacion') then
    new.approved_by := null;
    new.approved_at := null;
  else
    -- La aprobación registrada no se puede alterar manualmente
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;

create trigger requisitions_status_rules
  before insert or update on public.requisitions
  for each row execute function private.requisition_status_rules();

-- ---------------------------------------------------------------------
-- 3) Reglas de las vacantes
-- ---------------------------------------------------------------------
create or replace function private.vacancy_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req_status public.requisition_status;
begin
  select r.status into v_req_status from public.requisitions r where r.id = new.requisition_id;

  if tg_op = 'UPDATE' then
    if new.requisition_id <> old.requisition_id then
      raise exception 'Una vacante no puede cambiar de requisición' using errcode = '23514';
    end if;
    -- Mínimo privilegio: el reclutador asignado solo actualiza estado y plazas cubiertas.
    if auth.uid() is not null and not private.has_any_role('admin', 'coordinador')
       and (to_jsonb(new) - array['status', 'filled_count', 'updated_at', 'published_at'])
           is distinct from (to_jsonb(old) - array['status', 'filled_count', 'updated_at', 'published_at']) then
      raise exception 'Solo administración o coordinación puede modificar los datos de la vacante' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if v_req_status is null or v_req_status not in ('aprobada', 'en_proceso') then
      raise exception 'Solo se pueden crear vacantes de requisiciones aprobadas o en proceso' using errcode = '23514';
    end if;
    new.filled_count := coalesce(new.filled_count, 0);
  end if;

  -- Fecha de publicación automática la primera vez que se abre
  if new.status = 'abierta' and new.published_at is null then
    new.published_at := now();
  end if;

  -- Plazas cubiertas: estado automático
  if new.filled_count >= new.openings and new.status in ('abierta', 'pausada') then
    new.status := 'cubierta';
  elsif tg_op = 'UPDATE' and old.status = 'cubierta' and new.status = 'cubierta' and new.filled_count < new.openings then
    new.status := 'abierta';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'borrador' and new.status = 'borrador' then
    raise exception 'Una vacante publicada no puede volver a borrador' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger vacancies_rules
  before insert or update on public.vacancies
  for each row execute function private.vacancy_rules();

-- Al crear la primera vacante de una requisición aprobada, pasa a «en proceso».
-- SECURITY DEFINER: lo realiza el sistema aunque el usuario no pueda editar la requisición.
create or replace function private.requisition_in_progress_on_vacancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.requisitions set status = 'en_proceso'
  where id = new.requisition_id and status = 'aprobada';
  return new;
end;
$$;

create trigger vacancies_mark_requisition_in_progress
  after insert on public.vacancies
  for each row execute function private.requisition_in_progress_on_vacancy();

revoke all on function private.requisition_transition_allowed(public.requisition_status, public.requisition_status) from public;
-- El trigger de requisiciones se ejecuta con los privilegios del usuario: necesita esta función pura.
grant execute on function private.requisition_transition_allowed(public.requisition_status, public.requisition_status) to authenticated;
revoke all on function private.requisition_status_rules() from public, authenticated;
revoke all on function private.vacancy_rules() from public, authenticated;
revoke all on function private.requisition_in_progress_on_vacancy() from public, authenticated;

-- ---------------------------------------------------------------------
-- 4) Requisitos sugeridos para una vacante
--    Copia los requisitos activos de cliente+puesto, cliente, puesto y
--    globales (el más específico gana) sin duplicar los existentes.
-- ---------------------------------------------------------------------
create or replace function public.load_vacancy_requirements(p_vacancy_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client uuid;
  v_position uuid;
  v_count integer;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select r.client_id, v.position_id into v_client, v_position
  from public.vacancies v join public.requisitions r on r.id = v.requisition_id
  where v.id = p_vacancy_id;
  if not found then
    raise exception 'La vacante no existe' using errcode = '23503';
  end if;

  insert into public.requirement_templates
    (client_id, position_id, vacancy_id, catalog_requirement_id, min_level_id,
     position_title, requirement, requirement_type, category, expected_level, weight)
  select distinct on (lower(s.requirement))
         v_client, v_position, p_vacancy_id, s.catalog_requirement_id, s.min_level_id,
         s.position_title, s.requirement, s.requirement_type, s.category, s.expected_level, s.weight
  from public.requirement_templates s
  where s.is_active and s.vacancy_id is null
    and (s.client_id is null or s.client_id = v_client)
    and (s.position_id is null or s.position_id = v_position)
    and not exists (
      select 1 from public.requirement_templates d
      where d.vacancy_id = p_vacancy_id and lower(d.requirement) = lower(s.requirement)
    )
  order by lower(s.requirement),
           (s.client_id is not null)::int + (s.position_id is not null)::int desc,
           (s.client_id is not null) desc;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Duplicar una vacante (datos, proceso propio y requisitos; nunca
--    postulaciones). La copia queda en borrador y sin plazas cubiertas.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_vacancy(p_vacancy_id uuid, p_requisition_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.vacancies%rowtype;
  v_new uuid;
  v_template uuid;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v from public.vacancies where id = p_vacancy_id;
  if not found then
    raise exception 'La vacante de origen no existe' using errcode = '23503';
  end if;

  insert into public.vacancies
    (requisition_id, title, description, requirements, province, location_detail, modality,
     employment_type, status, openings, salary_min, salary_max, currency, closes_at,
     recruiter_id, position_id, work_schedule, priority, filled_count, source_vacancy_id)
  values
    (coalesce(p_requisition_id, v.requisition_id), v.title, v.description, v.requirements, v.province,
     v.location_detail, v.modality, v.employment_type, 'borrador', v.openings, v.salary_min, v.salary_max,
     v.currency, null, v.recruiter_id, v.position_id, v.work_schedule, v.priority, 0, v.id)
  returning id into v_new;

  select t.id into v_template from public.pipeline_templates t where t.vacancy_id = p_vacancy_id and t.is_default;
  if v_template is not null then
    perform public.duplicate_pipeline_template(v_template, null, null, v_new, null);
  end if;

  insert into public.requirement_templates
    (client_id, position_id, vacancy_id, catalog_requirement_id, min_level_id,
     position_title, requirement, requirement_type, category, expected_level, weight)
  select s.client_id, s.position_id, v_new, s.catalog_requirement_id, s.min_level_id,
         s.position_title, s.requirement, s.requirement_type, s.category, s.expected_level, s.weight
  from public.requirement_templates s
  where s.vacancy_id = p_vacancy_id and s.is_active;

  return v_new;
end;
$$;

revoke all on function public.load_vacancy_requirements(uuid) from public, anon;
revoke all on function public.duplicate_vacancy(uuid, uuid) from public, anon;
grant execute on function public.load_vacancy_requirements(uuid) to authenticated;
grant execute on function public.duplicate_vacancy(uuid, uuid) to authenticated;
