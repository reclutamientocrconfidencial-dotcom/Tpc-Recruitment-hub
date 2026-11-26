-- =====================================================================
-- TPC Recruitment Hub — Fase 2D: postulaciones y seguimiento.
-- Migración 1100:
--   1. Etapas de cada vacante (vacancy_stages): se fijan desde el proceso
--      resuelto (vacante → cliente+puesto → cliente → puesto → estándar) al
--      recibir la primera postulación; se pueden actualizar sin perder historia.
--   2. Postulación en una etapa de su vacante, con reglas en la BD: candidato
--      activo y con consentimiento, vacante abierta o pausada, motivo de
--      descarte obligatorio, contratación sujeta a plazas disponibles (las
--      plazas cubiertas de la vacante se actualizan solas).
--   3. Historial de movimientos (inalterable), observaciones con nivel de
--      confidencialidad, seguimiento de requisitos por postulación,
--      calificación y próximos pasos.
--
-- Compatible: la columna stage (enumerado de la fase 1) se mantiene
-- sincronizada para el tablero de indicadores.
-- Verificación: supabase/verification/1100_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Etapas de la vacante
-- ---------------------------------------------------------------------
create table public.vacancy_stages (
  id                 uuid primary key default gen_random_uuid(),
  vacancy_id         uuid not null references public.vacancies (id) on delete cascade,
  position           smallint not null check (position between 1 and 50),
  name               text not null check (char_length(name) between 2 and 60),
  category           public.stage_category not null,
  stage_type         public.stage_type not null default 'general',
  target_days        smallint check (target_days is null or target_days between 0 and 365),
  catalog_stage_id   uuid references public.stage_catalog (id) on delete set null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (vacancy_id, name)
);
comment on table public.vacancy_stages is 'Etapas fijadas de una vacante (columnas del tablero Kanban).';
create index vacancy_stages_vacancy_idx on public.vacancy_stages (vacancy_id, position);

alter table public.vacancy_stages enable row level security;
alter table public.vacancy_stages force row level security;
revoke all on public.vacancy_stages from anon, authenticated;
grant select on public.vacancy_stages to authenticated;
create policy "vacancy_stages: leer (activos)" on public.vacancy_stages for select to authenticated using ((select private.is_active_user()));

-- Fija o actualiza las etapas desde el proceso resuelto. Nunca elimina etapas con postulaciones.
create or replace function private.freeze_vacancy_stages(p_vacancy_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid; v_position uuid; v_template uuid; v_count integer := 0;
begin
  select r.client_id, v.position_id into v_client, v_position
  from public.vacancies v join public.requisitions r on r.id = v.requisition_id where v.id = p_vacancy_id;
  if not found then raise exception 'La vacante no existe' using errcode = '23503'; end if;
  v_template := public.resolve_pipeline_template(v_client, v_position, p_vacancy_id);
  if v_template is null then raise exception 'No hay un proceso de etapas aplicable a la vacante' using errcode = '23514'; end if;

  -- Etapas que ya no están en el proceso: se desactivan si no tienen postulaciones; se eliminan si nadie las usó.
  delete from public.vacancy_stages vs
   where vs.vacancy_id = p_vacancy_id
     and not exists (select 1 from public.pipeline_stages s where s.template_id = v_template and lower(s.name) = lower(vs.name))
     and not exists (select 1 from public.applications a where a.stage_id = vs.id)
     and not exists (select 1 from public.application_events e where e.from_stage_id = vs.id or e.to_stage_id = vs.id);
  update public.vacancy_stages vs set is_active = false, position = 40 + least(vs.position, 9)
   where vs.vacancy_id = p_vacancy_id
     and not exists (select 1 from public.pipeline_stages s where s.template_id = v_template and lower(s.name) = lower(vs.name));

  insert into public.vacancy_stages (vacancy_id, position, name, category, stage_type, target_days, catalog_stage_id, is_active)
  select p_vacancy_id, s.position, s.name, s.category, s.stage_type, s.target_days, s.catalog_stage_id, true
  from public.pipeline_stages s where s.template_id = v_template
  on conflict (vacancy_id, name) do update set
    position = excluded.position, category = excluded.category, stage_type = excluded.stage_type,
    target_days = excluded.target_days, catalog_stage_id = excluded.catalog_stage_id, is_active = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.freeze_vacancy_stages(uuid) from public, authenticated;

-- ---------------------------------------------------------------------
-- 2) Postulaciones: columnas nuevas
-- ---------------------------------------------------------------------
alter table public.applications
  add column stage_id        uuid references public.vacancy_stages (id) on delete restrict,
  add column discard_reason  text check (discard_reason is null or discard_reason in
                               ('no_cumple_requisitos', 'no_se_presento', 'no_responde', 'rechazo_oferta', 'retiro_voluntario',
                                'seleccionado_otro', 'expectativa_salarial', 'cliente_descarta', 'otro')),
  add column discard_note    text check (discard_note is null or char_length(discard_note) <= 500),
  add column next_action     text check (next_action is null or char_length(next_action) <= 200),
  add column next_action_at  date,
  add column hired_at        timestamptz,
  add column updated_by      uuid references public.profiles (id) on delete set null;
create index applications_stage_id_idx on public.applications (stage_id);
create index applications_next_action_idx on public.applications (next_action_at) where next_action_at is not null;

-- Historial (inalterable) de cada postulación
create table public.application_events (
  id              bigint generated always as identity primary key,
  application_id  uuid not null references public.applications (id) on delete cascade,
  event_type      text not null check (event_type in ('creada', 'cambio_etapa', 'calificacion', 'requisito', 'nota', 'proximo_paso')),
  from_stage_id   uuid references public.vacancy_stages (id) on delete set null,
  to_stage_id     uuid references public.vacancy_stages (id) on delete set null,
  detail          text check (detail is null or char_length(detail) <= 500),
  actor_id        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.application_events is 'Historial de movimientos y resultados de cada postulación (solo se agrega).';
create index application_events_app_idx on public.application_events (application_id, created_at desc);

alter table public.application_events enable row level security;
alter table public.application_events force row level security;
revoke all on public.application_events from anon, authenticated;
grant select on public.application_events to authenticated;
-- Personal operativo que puede ver la postulación (RLS de applications aplica en la subconsulta). Consulta no.
create policy "application_events: leer (operativo)" on public.application_events for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador', 'reclutador'))
         and exists (select 1 from public.applications a where a.id = application_id));

-- Observaciones con nivel de confidencialidad
create table public.application_notes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  visibility      text not null default 'equipo' check (visibility in ('equipo', 'confidencial')),
  author_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
comment on table public.application_notes is 'Observaciones: «equipo» (personal operativo) o «confidencial» (autor, coordinación y administración).';
create index application_notes_app_idx on public.application_notes (application_id, created_at desc);

alter table public.application_notes enable row level security;
alter table public.application_notes force row level security;
revoke all on public.application_notes from anon, authenticated;
grant select, insert on public.application_notes to authenticated;
create policy "application_notes: leer" on public.application_notes for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador', 'reclutador'))
         and exists (select 1 from public.applications a where a.id = application_id)
         and (visibility = 'equipo' or author_id = (select auth.uid()) or (select private.has_any_role('admin', 'coordinador'))));
create policy "application_notes: crear" on public.application_notes for insert to authenticated
  with check (author_id = (select auth.uid())
              and (select private.has_any_role('admin', 'coordinador', 'reclutador'))
              and exists (select 1 from public.applications a where a.id = application_id));
create trigger application_notes_audit after insert or update or delete on public.application_notes
  for each row execute function private.write_audit_log();

-- Bitácora para tablas sin «id» propio: registra la postulación como referencia (sin valores).
create or replace function private.write_audit_log_by_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[] := '{}';
  v_old jsonb; v_new jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    select coalesce(array_agg(k order by k), '{}') into v_fields
    from jsonb_object_keys(v_new) k
    where k not in ('evaluated_at', 'evaluated_by') and v_new -> k is distinct from v_old -> k;
    if cardinality(v_fields) = 0 then return new; end if;
  end if;
  insert into public.audit_logs (table_name, record_id, action, changed_fields, actor_id)
  values (tg_table_name, case when tg_op = 'DELETE' then old.application_id else new.application_id end, tg_op, v_fields, auth.uid());
  return coalesce(new, old);
end;
$$;
revoke all on function private.write_audit_log_by_application() from public, authenticated;

-- Seguimiento de requisitos de la vacante por postulación
create table public.application_requirement_checks (
  application_id  uuid not null references public.applications (id) on delete cascade,
  requirement_id  uuid not null references public.requirement_templates (id) on delete cascade,
  status          text not null default 'pendiente' check (status in ('pendiente', 'cumple', 'no_cumple', 'no_aplica')),
  level_id        uuid references public.proficiency_levels (id) on delete restrict,
  note            text check (note is null or char_length(note) <= 300),
  evaluated_by    uuid references public.profiles (id) on delete set null,
  evaluated_at    timestamptz not null default now(),
  primary key (application_id, requirement_id)
);
alter table public.application_requirement_checks enable row level security;
alter table public.application_requirement_checks force row level security;
revoke all on public.application_requirement_checks from anon, authenticated;
grant select on public.application_requirement_checks to authenticated;
create policy "application_requirement_checks: leer (operativo)" on public.application_requirement_checks for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador', 'reclutador'))
         and exists (select 1 from public.applications a where a.id = application_id));
create trigger application_requirement_checks_audit after insert or update or delete on public.application_requirement_checks
  for each row execute function private.write_audit_log_by_application();

-- ---------------------------------------------------------------------
-- 3) Reglas de las postulaciones (la base de datos decide)
-- ---------------------------------------------------------------------
-- Enumerado de la fase 1 (indicadores) a partir de la etapa de la vacante
create or replace function private.legacy_stage(p_category public.stage_category, p_type public.stage_type, p_reason text)
returns public.application_stage language sql immutable set search_path = '' as $$
  select case p_category
    when 'nuevo' then 'nuevo'::public.application_stage
    when 'oferta' then 'oferta'
    when 'contratado' then 'contratado'
    when 'descartado' then case when p_reason in ('retiro_voluntario', 'rechazo_oferta') then 'retirado'::public.application_stage else 'descartado' end
    else case p_type when 'entrevista' then 'entrevista'::public.application_stage when 'prueba' then 'prueba_tecnica' else 'preseleccion' end
  end
$$;
revoke all on function private.legacy_stage(public.stage_category, public.stage_type, text) from public, authenticated;

create or replace function private.applications_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage public.vacancy_stages%rowtype;
  v_old_cat public.stage_category;
  v_vac record;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.candidates c where c.id = new.candidate_id and c.status = 'activo' and c.consent_given) then
      raise exception 'El candidato debe estar activo y con consentimiento vigente para postularlo' using errcode = '23514';
    end if;
    if not exists (select 1 from public.vacancies v where v.id = new.vacancy_id and v.status in ('abierta', 'pausada')) then
      raise exception 'Solo se postulan candidatos a vacantes abiertas o pausadas' using errcode = '23514';
    end if;
    if not exists (select 1 from public.vacancy_stages s where s.vacancy_id = new.vacancy_id) then
      perform private.freeze_vacancy_stages(new.vacancy_id);
    end if;
    -- Compatibilidad (fase 1): si se indica «stage», se usa la etapa equivalente de la vacante.
    if new.stage_id is null and new.stage is not null and new.stage <> 'nuevo' then
      select s.id into new.stage_id from public.vacancy_stages s
      where s.vacancy_id = new.vacancy_id and s.is_active
        and s.category = case new.stage
              when 'oferta' then 'oferta'::public.stage_category when 'contratado' then 'contratado'
              when 'descartado' then 'descartado' when 'retirado' then 'descartado' else 'en_proceso' end
      order by (new.stage = 'entrevista' and s.stage_type = 'entrevista') desc, (new.stage = 'prueba_tecnica' and s.stage_type = 'prueba') desc, s.position
      limit 1;
      if new.stage in ('descartado', 'retirado') and new.discard_reason is null then
        new.discard_reason := case when new.stage = 'retirado' then 'retiro_voluntario' else 'otro' end;
      end if;
    end if;
    if new.stage_id is null then
      select s.id into new.stage_id from public.vacancy_stages s
      where s.vacancy_id = new.vacancy_id and s.is_active
      order by (s.category = 'nuevo') desc, s.position limit 1;
    end if;
    if auth.uid() is not null and new.recruiter_id is null then new.recruiter_id := auth.uid(); end if;
  else
    if new.vacancy_id <> old.vacancy_id or new.candidate_id <> old.candidate_id then
      raise exception 'Una postulación no cambia de vacante ni de candidato: cree una postulación nueva' using errcode = '23514';
    end if;
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
    -- Compatibilidad (fase 1): un cambio solo en «stage» se traduce a la etapa equivalente de la vacante.
    if new.stage is distinct from old.stage and new.stage_id is not distinct from old.stage_id then
      select s.id into new.stage_id from public.vacancy_stages s
      where s.vacancy_id = new.vacancy_id and s.is_active
        and s.category = case new.stage
              when 'nuevo' then 'nuevo'::public.stage_category when 'oferta' then 'oferta' when 'contratado' then 'contratado'
              when 'descartado' then 'descartado' when 'retirado' then 'descartado' else 'en_proceso' end
      order by (new.stage = 'entrevista' and s.stage_type = 'entrevista') desc, (new.stage = 'prueba_tecnica' and s.stage_type = 'prueba') desc, s.position
      limit 1;
      if new.stage_id is null then new.stage_id := old.stage_id; end if;
    end if;
  end if;

  select * into v_stage from public.vacancy_stages s where s.id = new.stage_id;
  if not found or v_stage.vacancy_id <> new.vacancy_id then
    raise exception 'La etapa no pertenece al proceso de la vacante' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    if tg_op = 'UPDATE' then
      select s.category into v_old_cat from public.vacancy_stages s where s.id = old.stage_id;
    end if;
    if not v_stage.is_active then
      raise exception 'La etapa ya no forma parte del proceso de la vacante' using errcode = '23514';
    end if;
    if v_stage.category = 'descartado' then
      if new.discard_reason is null then
        raise exception 'Indique el motivo del descarte' using errcode = '23514';
      end if;
    else
      new.discard_reason := null;
      new.discard_note := null;
    end if;
    if v_stage.category = 'contratado' and v_old_cat is distinct from 'contratado' then
      select v.openings, v.filled_count, v.status into v_vac from public.vacancies v where v.id = new.vacancy_id for update;
      if v_vac.status not in ('abierta', 'pausada') or v_vac.filled_count >= v_vac.openings then
        raise exception 'La vacante no tiene plazas disponibles para contratar' using errcode = '23514';
      end if;
      new.hired_at := now();
    elsif v_stage.category <> 'contratado' then
      new.hired_at := null;
    end if;
    new.stage_changed_at := now();
  end if;
  new.stage := private.legacy_stage(v_stage.category, v_stage.stage_type, new.discard_reason);
  return new;
end;
$$;
create trigger applications_rules before insert or update on public.applications
  for each row execute function private.applications_rules();

-- Historial y plazas cubiertas
create or replace function private.applications_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new_cat public.stage_category;
  v_old_cat public.stage_category;
  v_detail text;
begin
  select category into v_new_cat from public.vacancy_stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, event_type, to_stage_id, actor_id)
    values (new.id, 'creada', new.stage_id, auth.uid());
  else
    select category into v_old_cat from public.vacancy_stages where id = old.stage_id;
    if new.stage_id is distinct from old.stage_id then
      v_detail := case when v_new_cat = 'descartado' then 'Motivo: ' || new.discard_reason || coalesce(' — ' || new.discard_note, '') end;
      insert into public.application_events (application_id, event_type, from_stage_id, to_stage_id, detail, actor_id)
      values (new.id, 'cambio_etapa', old.stage_id, new.stage_id, v_detail, auth.uid());
    end if;
    if new.rating is distinct from old.rating then
      insert into public.application_events (application_id, event_type, detail, actor_id)
      values (new.id, 'calificacion', 'Calificación: ' || coalesce(new.rating::text, 'sin calificar'), auth.uid());
    end if;
    if new.next_action is distinct from old.next_action or new.next_action_at is distinct from old.next_action_at then
      insert into public.application_events (application_id, event_type, detail, actor_id)
      values (new.id, 'proximo_paso', left(coalesce(new.next_action, 'Sin próximo paso') || coalesce(' (' || to_char(new.next_action_at, 'DD/MM/YYYY') || ')', ''), 500), auth.uid());
    end if;
  end if;
  -- Contratación: las plazas cubiertas de la vacante se actualizan solas
  if v_new_cat = 'contratado' and (tg_op = 'INSERT' or v_old_cat is distinct from 'contratado') then
    update public.vacancies set filled_count = filled_count + 1 where id = new.vacancy_id;
  elsif tg_op = 'UPDATE' and v_old_cat = 'contratado' and v_new_cat is distinct from 'contratado' then
    update public.vacancies set filled_count = greatest(filled_count - 1, 0) where id = new.vacancy_id;
  end if;
  return new;
end;
$$;
create trigger applications_after after insert or update on public.applications
  for each row execute function private.applications_after();

revoke all on function private.applications_rules() from public, authenticated;
revoke all on function private.applications_after() from public, authenticated;

-- Las observaciones también quedan en el historial (sin su contenido)
create or replace function private.application_notes_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.application_events (application_id, event_type, detail, actor_id)
  values (new.application_id, 'nota', case when new.visibility = 'confidencial' then 'Observación confidencial' else 'Observación del equipo' end, new.author_id);
  return new;
end;
$$;
create trigger application_notes_event after insert on public.application_notes
  for each row execute function private.application_notes_event();
revoke all on function private.application_notes_event() from public, authenticated;

-- ---------------------------------------------------------------------
-- 4) Operaciones (SECURITY DEFINER con autorización explícita)
-- ---------------------------------------------------------------------
-- ¿Puede gestionar la postulación? Admin/coord, o reclutador responsable o asignado a la vacante.
create or replace function private.can_manage_application(p_application_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador')
      or (private.has_any_role('reclutador') and exists (
            select 1 from public.applications a
            where a.id = p_application_id and (a.recruiter_id = auth.uid() or private.is_assigned_to_vacancy(a.vacancy_id))))
$$;
revoke all on function private.can_manage_application(uuid) from public;
grant execute on function private.can_manage_application(uuid) to authenticated;

-- Vincular un candidato a una vacante
create or replace function public.create_application(p_vacancy_id uuid, p_candidate_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (private.has_any_role('admin', 'coordinador') or (private.has_any_role('reclutador') and private.is_assigned_to_vacancy(p_vacancy_id))) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.applications a where a.vacancy_id = p_vacancy_id and a.candidate_id = p_candidate_id) then
    raise exception 'El candidato ya está postulado a esta vacante' using errcode = '23514';
  end if;
  insert into public.applications (vacancy_id, candidate_id, recruiter_id, created_by)
  values (p_vacancy_id, p_candidate_id, auth.uid(), auth.uid())
  returning id into v_id;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.application_notes (application_id, body, visibility, author_id) values (v_id, btrim(p_note), 'equipo', auth.uid());
  end if;
  return v_id;
end;
$$;

-- Mover de etapa (con motivo obligatorio al descartar)
create or replace function public.move_application(p_application_id uuid, p_stage_id uuid, p_discard_reason text default null, p_discard_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_application(p_application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.applications
     set stage_id = p_stage_id, discard_reason = nullif(p_discard_reason, ''), discard_note = nullif(btrim(coalesce(p_discard_note, '')), '')
   where id = p_application_id;
end;
$$;

-- Calificación y próximo paso
create or replace function public.update_application_tracking(p_application_id uuid, p_rating smallint, p_next_action text, p_next_action_at date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_application(p_application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.applications
     set rating = p_rating, next_action = nullif(btrim(coalesce(p_next_action, '')), ''), next_action_at = p_next_action_at
   where id = p_application_id;
end;
$$;

-- Evaluación de un requisito de la vacante
create or replace function public.set_requirement_check(p_application_id uuid, p_requirement_id uuid, p_status text, p_level_id uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.requirement_templates%rowtype;
  v_scale uuid;
begin
  if not private.can_manage_application(p_application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_req from public.requirement_templates r
  where r.id = p_requirement_id and r.vacancy_id = (select a.vacancy_id from public.applications a where a.id = p_application_id);
  if not found then
    raise exception 'El requisito no pertenece a la vacante de la postulación' using errcode = '23514';
  end if;
  if p_level_id is not null then
    select c.scale_id into v_scale from public.requirement_catalog c where c.id = v_req.catalog_requirement_id;
    if v_scale is null or not exists (select 1 from public.proficiency_levels l where l.id = p_level_id and l.scale_id = v_scale) then
      raise exception 'El nivel no corresponde a la escala del requisito' using errcode = '23514';
    end if;
  end if;
  insert into public.application_requirement_checks as k (application_id, requirement_id, status, level_id, note, evaluated_by, evaluated_at)
  values (p_application_id, p_requirement_id, p_status, p_level_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (application_id, requirement_id) do update set
    status = excluded.status, level_id = excluded.level_id, note = excluded.note, evaluated_by = excluded.evaluated_by, evaluated_at = now();
  insert into public.application_events (application_id, event_type, detail, actor_id)
  values (p_application_id, 'requisito', left(v_req.requirement || ': ' || p_status, 500), auth.uid());
end;
$$;

-- Actualiza las etapas de la vacante con su proceso actual (admin/coord)
create or replace function public.sync_vacancy_stages(p_vacancy_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return private.freeze_vacancy_stages(p_vacancy_id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_application(uuid, uuid, text)',
    'public.move_application(uuid, uuid, text, text)',
    'public.update_application_tracking(uuid, smallint, text, date)',
    'public.set_requirement_check(uuid, uuid, text, uuid, text)',
    'public.sync_vacancy_stages(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Postulaciones existentes → etapas de su vacante
-- ---------------------------------------------------------------------
do $$
declare
  v uuid;
begin
  for v in select distinct vacancy_id from public.applications where stage_id is null loop
    perform private.freeze_vacancy_stages(v);
  end loop;
end;
$$;
alter table public.applications disable trigger applications_rules;
alter table public.applications disable trigger applications_after;
update public.applications a set stage_id = (
  select s.id from public.vacancy_stages s
  where s.vacancy_id = a.vacancy_id and s.is_active
  order by
    case
      when a.stage = 'nuevo' and s.category = 'nuevo' then 0
      when a.stage = 'entrevista' and s.stage_type = 'entrevista' then 0
      when a.stage = 'prueba_tecnica' and s.stage_type = 'prueba' then 0
      when a.stage = 'preseleccion' and s.category = 'en_proceso' then 1
      when a.stage in ('entrevista', 'prueba_tecnica') and s.category = 'en_proceso' then 2
      when a.stage = 'oferta' and s.category = 'oferta' then 0
      when a.stage = 'contratado' and s.category = 'contratado' then 0
      when a.stage in ('descartado', 'retirado') and s.category = 'descartado' then 0
      else 9
    end, s.position
  limit 1)
where a.stage_id is null;
update public.applications set discard_reason = case when stage = 'retirado' then 'retiro_voluntario' else 'otro' end
where stage in ('descartado', 'retirado') and discard_reason is null;
alter table public.applications enable trigger applications_rules;
alter table public.applications enable trigger applications_after;

-- ---------------------------------------------------------------------
-- 6) Corrección (0820): eliminar un usuario que aprobó requisiciones fallaba
--    porque el trigger restauraba approved_by. Mismas reglas, con esa excepción.
-- ---------------------------------------------------------------------
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
    -- (salvo que el usuario que aprobó se haya eliminado: ON DELETE SET NULL).
    if new.approved_by is null and old.approved_by is not null
       and not exists (select 1 from public.profiles p where p.id = old.approved_by) then
      new.approved_at := old.approved_at;
    else
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    end if;
  end if;
  return new;
end;
$$;

