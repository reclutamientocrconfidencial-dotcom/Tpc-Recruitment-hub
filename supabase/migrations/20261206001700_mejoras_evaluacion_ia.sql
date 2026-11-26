-- =====================================================================
-- TPC Recruitment Hub — Mejoras integrales de evaluación e IA (fases 4 y 5).
-- Migración 1700 (incremental y compatible con 1300/1400).
--   1. Perfiles curriculares estructurados (lectura de CV) con revisión y
--      confirmación humana antes de incorporarlos a la ficha.
--   2. Nuevas funciones de IA: preselección con matriz de cumplimiento,
--      preguntas de entrevista personalizadas, conclusiones de entrevista e
--      informe ejecutivo; análisis por lotes sin duplicar consultas, con
--      progreso y tope de costo.
--   3. Guion de entrevista editable (agregar, editar y quitar preguntas) con
--      competencia evaluada y origen de cada pregunta.
--   4. Evaluaciones configurables por tipo (entrevista, Excel, inglés,
--      técnica, caso práctico, assessment center, campo, referencias…),
--      ponderaciones, criterios aprobados por el reclutador y puntaje
--      normalizado; las no aplicables no afectan el resultado.
--   5. Plantilla del informe ejecutivo v2 (13 apartados) y exportación
--      registrada de informes comparativos de ternas.
-- Verificación: supabase/verification/1700_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Perfil curricular estructurado
-- ---------------------------------------------------------------------
create table public.candidate_cv_profiles (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates (id) on delete cascade,
  document_id   uuid references public.candidate_documents (id) on delete set null,
  source        text not null check (source in ('ia', 'simulado', 'manual')),
  ai_request_id uuid references public.ai_requests (id) on delete set null,
  status        text not null default 'borrador' check (status in ('borrador', 'confirmado', 'reemplazado', 'descartado')),
  quality       text not null default 'legible' check (quality in ('legible', 'parcial', 'ilegible')),
  quality_note  text check (quality_note is null or char_length(quality_note) <= 300),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  confirmed_by  uuid references public.profiles (id) on delete set null,
  confirmed_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index candidate_cv_profiles_candidate_idx on public.candidate_cv_profiles (candidate_id, created_at desc);
create unique index candidate_cv_profiles_one_confirmed on public.candidate_cv_profiles (candidate_id) where status = 'confirmado';

create or replace function private.cv_profiles_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.candidate_id <> old.candidate_id then
      raise exception 'El perfil no cambia de candidato' using errcode = '23514';
    end if;
    -- Un perfil confirmado solo puede pasar a «reemplazado» (por la función de confirmación)
    if old.status in ('confirmado', 'reemplazado', 'descartado') and (new.data is distinct from old.data or new.status not in (old.status, 'reemplazado')) then
      raise exception 'Un perfil confirmado no se modifica: cree una nueva revisión' using errcode = '23514';
    end if;
    if new.status = 'confirmado' and old.status <> 'confirmado' and coalesce(current_setting('tpc.confirming_cv', true), '') <> new.id::text then
      raise exception 'Use la confirmación del perfil' using errcode = '23514';
    end if;
  elsif new.status <> 'borrador' then
    raise exception 'El perfil se crea en borrador' using errcode = '23514';
  end if;
  -- Quién y cuándo confirmó lo registra solo la función de confirmación (no se suplanta)
  if coalesce(current_setting('tpc.confirming_cv', true), '') <> new.id::text then
    if tg_op = 'INSERT' then
      new.confirmed_by := null;
      new.confirmed_at := null;
    else
      new.confirmed_by := case when new.confirmed_by is null then null else old.confirmed_by end;
      new.confirmed_at := old.confirmed_at;
    end if;
  end if;
  if new.document_id is not null and not exists (select 1 from public.candidate_documents d where d.id = new.document_id and d.candidate_id = new.candidate_id) then
    raise exception 'El documento no pertenece al candidato' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger cv_profiles_rules before insert or update on public.candidate_cv_profiles for each row execute function private.cv_profiles_rules();
create trigger cv_profiles_set_created_by before insert on public.candidate_cv_profiles for each row execute function private.set_created_by();

alter table public.candidate_cv_profiles enable row level security;
alter table public.candidate_cv_profiles force row level security;
revoke all on public.candidate_cv_profiles from anon, authenticated;
grant select, insert, update on public.candidate_cv_profiles to authenticated;
create policy "candidate_cv_profiles: leer" on public.candidate_cv_profiles for select to authenticated
  using (private.is_operational() and private.can_view_candidate_private(candidate_id));
create policy "candidate_cv_profiles: crear" on public.candidate_cv_profiles for insert to authenticated
  with check (private.is_operational() and private.can_view_candidate_private(candidate_id));
create policy "candidate_cv_profiles: editar" on public.candidate_cv_profiles for update to authenticated
  using (private.is_operational() and private.can_view_candidate_private(candidate_id))
  with check (private.is_operational() and private.can_view_candidate_private(candidate_id));
create trigger candidate_cv_profiles_audit after insert or update or delete on public.candidate_cv_profiles
  for each row execute function private.write_audit_log();

-- Confirmación humana: reemplaza el confirmado anterior y, si se pide, actualiza la ficha
-- (solo puesto actual, años de experiencia e inglés; nunca datos de contacto).
create or replace function public.confirm_cv_profile(p_id uuid, p_update_candidate boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.candidate_cv_profiles%rowtype;
  v_title text;
  v_years numeric;
  v_english text;
begin
  select * into r from public.candidate_cv_profiles where id = p_id for update;
  if not found or not (private.is_operational() and private.can_view_candidate_private(r.candidate_id)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if r.status <> 'borrador' then
    raise exception 'Solo se confirma un perfil en borrador' using errcode = '23514';
  end if;
  update public.candidate_cv_profiles set status = 'reemplazado' where candidate_id = r.candidate_id and status = 'confirmado';
  -- Marca de la transacción: el trigger solo admite «confirmado» desde esta función
  perform set_config('tpc.confirming_cv', p_id::text, true);
  update public.candidate_cv_profiles set status = 'confirmado', confirmed_by = auth.uid(), confirmed_at = now() where id = p_id;
  perform set_config('tpc.confirming_cv', '', true);
  if p_update_candidate then
    v_title := nullif(left(btrim(coalesce(r.data ->> 'puesto_actual', '')), 150), '');
    v_years := case when coalesce(r.data ->> 'anios_experiencia', '') ~ '^\d{1,2}(\.\d+)?$' then least((r.data ->> 'anios_experiencia')::numeric, 70) end;
    select upper(i ->> 'nivel') into v_english from jsonb_array_elements(coalesce(r.data -> 'idiomas', '[]'::jsonb)) i
      where lower(i ->> 'idioma') in ('inglés', 'ingles', 'english') limit 1;
    if v_english is not null and v_english not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then v_english := null; end if;
    update public.candidates c set
      current_title = coalesce(v_title, c.current_title),
      years_experience = coalesce(round(v_years, 1), c.years_experience),
      english_level = coalesce(v_english, c.english_level)
    where c.id = r.candidate_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) IA: nuevas funciones y lotes
-- ---------------------------------------------------------------------
alter table public.ai_requests drop constraint if exists ai_requests_feature_check;
alter table public.ai_requests add constraint ai_requests_feature_check check (feature in (
  'extraer_cv', 'comparar', 'preguntas', 'borrador_informe', 'publicacion',
  'preseleccion', 'preguntas_entrevista', 'conclusiones_entrevista'));
alter table public.ai_requests add column batch_id uuid;
alter table public.ai_requests add column interview_id uuid references public.interviews (id) on delete cascade;
create index ai_requests_dedup_idx on public.ai_requests (feature, application_id, input_hash) where status in ('pendiente_revision', 'aceptado');

create or replace function public.ai_begin_request(p_feature text, p_candidate_id uuid default null, p_vacancy_id uuid default null,
                                                   p_application_id uuid default null, p_input_hash text default null, p_pseudonymized boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.ai_settings%rowtype;
  v_id uuid;
  v_today integer;
begin
  select * into s from public.ai_settings where id;
  if not private.is_operational() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not s.enabled then
    raise exception 'El asistente de IA está desactivado. Consulte a administración' using errcode = '23514';
  end if;
  if p_feature not in ('extraer_cv', 'comparar', 'preguntas', 'borrador_informe', 'publicacion',
                       'preseleccion', 'preguntas_entrevista', 'conclusiones_entrevista') then
    raise exception 'Función de IA no válida' using errcode = '22023';
  end if;
  if p_application_id is not null and not private.can_view_application_detail(p_application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_candidate_id is not null and not private.can_view_candidate_private(p_candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_vacancy_id is not null and not (private.has_any_role('admin', 'coordinador') or private.is_assigned_to_vacancy(p_vacancy_id)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select count(*) into v_today from public.ai_requests r
  where r.user_id = auth.uid() and r.created_at >= date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica';
  if v_today >= s.daily_requests_per_user then
    raise exception 'Alcanzó el límite diario de % consultas de IA', s.daily_requests_per_user using errcode = '23514';
  end if;
  if s.provider <> 'simulado' and private.ai_month_cost() >= s.monthly_budget_usd then
    raise exception 'Se agotó el presupuesto mensual de IA. Consulte a administración' using errcode = '23514';
  end if;
  insert into public.ai_requests (feature, user_id, provider, model, candidate_id, vacancy_id, application_id, input_hash, pseudonymized)
  values (p_feature, auth.uid(), s.provider, case when s.provider = 'simulado' then 'simulado-1' else s.model end,
          p_candidate_id, p_vacancy_id, p_application_id,
          case when p_input_hash ~ '^[0-9a-f]{64}$' then p_input_hash end, coalesce(p_pseudonymized, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'provider', s.provider, 'model', case when s.provider = 'simulado' then 'simulado-1' else s.model end);
end;
$$;

-- Asocia una solicitud a su entrevista o lote (solo quien la creó, mientras está en proceso)
create or replace function public.ai_tag_request(p_id uuid, p_interview_id uuid default null, p_batch_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_requests set interview_id = coalesce(p_interview_id, interview_id), batch_id = coalesce(p_batch_id, batch_id)
  where id = p_id and user_id = auth.uid() and status = 'en_proceso';
  if not found then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

-- Resultado reutilizable: misma función, misma postulación y mismo contenido enviado (no se duplica la consulta)
create or replace function public.ai_find_reusable(p_feature text, p_application_id uuid, p_input_hash text)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.ai_requests r
  where r.feature = p_feature and r.application_id = p_application_id and r.input_hash = p_input_hash
    and r.status in ('pendiente_revision', 'aceptado')
    and private.can_view_application_detail(p_application_id)
  order by r.created_at desc limit 1
$$;

create table public.ai_batches (
  id            uuid primary key default gen_random_uuid(),
  vacancy_id    uuid not null references public.vacancies (id) on delete cascade,
  feature       text not null default 'preseleccion' check (feature in ('preseleccion')),
  status        text not null default 'en_proceso' check (status in ('en_proceso', 'completado', 'detenido', 'cancelado')),
  total         integer not null default 0,
  processed     integer not null default 0,
  reused        integer not null default 0,
  failed        integer not null default 0,
  cost_usd      numeric(10, 4) not null default 0,
  max_cost_usd  numeric(10, 2) not null default 5 check (max_cost_usd between 0 and 1000),
  stop_reason   text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create table public.ai_batch_items (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.ai_batches (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  status          text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'procesado', 'reutilizado', 'error')),
  ai_request_id   uuid references public.ai_requests (id) on delete set null,
  error           text check (error is null or char_length(error) <= 300),
  updated_at      timestamptz not null default now(),
  unique (batch_id, application_id)
);
create index ai_batch_items_pending_idx on public.ai_batch_items (batch_id) where status = 'pendiente';

alter table public.ai_batches enable row level security;
alter table public.ai_batches force row level security;
alter table public.ai_batch_items enable row level security;
alter table public.ai_batch_items force row level security;
revoke all on public.ai_batches, public.ai_batch_items from anon, authenticated;
grant select on public.ai_batches, public.ai_batch_items to authenticated;
create policy "ai_batches: leer" on public.ai_batches for select to authenticated
  using (private.is_operational() and (created_by = (select auth.uid()) or (select private.has_any_role('admin', 'coordinador'))));
create policy "ai_batch_items: leer" on public.ai_batch_items for select to authenticated
  using (exists (select 1 from public.ai_batches b where b.id = batch_id));

-- Crea un lote con las postulaciones activas de la vacante que el usuario puede ver.
create or replace function public.create_ai_batch(p_vacancy_id uuid, p_max_cost numeric default 5)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n integer;
begin
  if not private.is_operational() or not (private.has_any_role('admin', 'coordinador') or private.is_assigned_to_vacancy(p_vacancy_id)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not (select enabled from public.ai_settings where id) then
    raise exception 'El asistente de IA está desactivado. Consulte a administración' using errcode = '23514';
  end if;
  if exists (select 1 from public.ai_batches b where b.vacancy_id = p_vacancy_id and b.status = 'en_proceso' and b.created_at > now() - interval '2 hours') then
    raise exception 'Ya hay un análisis en curso para esta vacante' using errcode = '23514';
  end if;
  insert into public.ai_batches (vacancy_id, max_cost_usd, created_by) values (p_vacancy_id, greatest(least(coalesce(p_max_cost, 5), 1000), 0), auth.uid())
  returning id into v_id;
  insert into public.ai_batch_items (batch_id, application_id)
  select v_id, a.id from public.applications a join public.vacancy_stages s on s.id = a.stage_id
  where a.vacancy_id = p_vacancy_id and s.category in ('nuevo', 'en_proceso') and private.can_view_application_detail(a.id)
  limit 200;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    delete from public.ai_batches where id = v_id;
    raise exception 'La vacante no tiene postulaciones activas para analizar' using errcode = '23514';
  end if;
  update public.ai_batches set total = v_n where id = v_id;
  return v_id;
end;
$$;

-- Toma el siguiente elemento pendiente (o null si terminó / se detuvo por costo).
create or replace function public.next_ai_batch_item(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.ai_batches%rowtype;
  i public.ai_batch_items%rowtype;
begin
  select * into b from public.ai_batches where id = p_batch_id for update;
  if not found or b.created_by is distinct from auth.uid() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if b.status <> 'en_proceso' then
    return null;
  end if;
  if b.cost_usd >= b.max_cost_usd and b.max_cost_usd > 0 and (select provider from public.ai_settings where id) <> 'simulado' then
    update public.ai_batches set status = 'detenido', stop_reason = 'Se alcanzó el tope de costo del lote', finished_at = now() where id = b.id;
    return null;
  end if;
  select * into i from public.ai_batch_items where batch_id = b.id and status = 'pendiente' order by id limit 1 for update skip locked;
  if not found then
    update public.ai_batches set status = 'completado', finished_at = now() where id = b.id and not exists (select 1 from public.ai_batch_items x where x.batch_id = b.id and x.status = 'en_proceso');
    return null;
  end if;
  update public.ai_batch_items set status = 'en_proceso', updated_at = now() where id = i.id;
  return jsonb_build_object('item_id', i.id, 'application_id', i.application_id);
end;
$$;

create or replace function public.finish_ai_batch_item(p_item_id uuid, p_status text, p_request_id uuid default null, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i public.ai_batch_items%rowtype;
  v_cost numeric := 0;
begin
  select it.* into i from public.ai_batch_items it join public.ai_batches b on b.id = it.batch_id
  where it.id = p_item_id and b.created_by = auth.uid() for update of it;
  if not found or i.status <> 'en_proceso' or p_status not in ('procesado', 'reutilizado', 'error') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_request_id is not null then
    select coalesce(cost_usd, 0) into v_cost from public.ai_requests where id = p_request_id and (p_status = 'reutilizado' or user_id = auth.uid());
  end if;
  update public.ai_batch_items set status = p_status, ai_request_id = p_request_id, error = left(p_error, 300), updated_at = now() where id = i.id;
  update public.ai_batches set
    processed = processed + case when p_status = 'procesado' then 1 else 0 end,
    reused = reused + case when p_status = 'reutilizado' then 1 else 0 end,
    failed = failed + case when p_status = 'error' then 1 else 0 end,
    cost_usd = cost_usd + case when p_status = 'procesado' then v_cost else 0 end
  where id = i.batch_id;
end;
$$;

create or replace function public.cancel_ai_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_batches set status = 'cancelado', stop_reason = 'Cancelado por el usuario', finished_at = now()
  where id = p_batch_id and status = 'en_proceso' and (created_by = auth.uid() or private.has_any_role('admin', 'coordinador'));
  if not found then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.ai_batch_items set status = 'error', error = 'Cancelado', updated_at = now() where batch_id = p_batch_id and status in ('pendiente', 'en_proceso');
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Guion de entrevista editable
-- ---------------------------------------------------------------------
alter table public.interview_answers
  add column origin text not null default 'banco' check (origin in ('banco', 'ia', 'manual')),
  add column competency text check (competency is null or char_length(competency) <= 80),
  add column objective text check (objective is null or char_length(objective) <= 300);
grant delete on public.interview_answers to authenticated;
create policy "interview_answers: quitar" on public.interview_answers for delete to authenticated
  using (exists (select 1 from public.interviews i where i.id = interview_id and private.can_view_application_detail(i.application_id) and i.status = 'programada'));

-- Competencia sugerida a partir de la categoría del banco para las preguntas ya creadas
update public.interview_answers a set competency = case q.category
    when 'competencia' then 'Competencias' when 'tecnica' then 'Conocimiento técnico' when 'motivacional' then 'Motivación'
    when 'situacional' then 'Resolución de situaciones' when 'cultura' then 'Ajuste cultural' else null end
from public.interview_questions q where q.id = a.question_id and a.competency is null;

create or replace function private.interviews_seed_questions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pos uuid;
  v_client uuid;
begin
  select v.position_id, r.client_id into v_pos, v_client
  from public.applications a join public.vacancies v on v.id = a.vacancy_id join public.requisitions r on r.id = v.requisition_id
  where a.id = new.application_id;
  insert into public.interview_answers (interview_id, position, question_id, question_text, guidance, origin, competency)
  select new.id, row_number() over (order by (q.client_id is not null), (q.position_id is not null), q.sort_order, q.created_at), q.id, q.text, q.guidance, 'banco',
         case q.category when 'competencia' then 'Competencias' when 'tecnica' then 'Conocimiento técnico' when 'motivacional' then 'Motivación'
                         when 'situacional' then 'Resolución de situaciones' when 'cultura' then 'Ajuste cultural' end
  from public.interview_questions q
  where q.is_active
    and (q.position_id is null or q.position_id = v_pos)
    and (q.client_id is null or q.client_id = v_client)
  order by 2
  limit 60;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Evaluaciones configurables y ponderadas
-- ---------------------------------------------------------------------
alter table public.assessment_types
  add column kind text not null default 'otra'
    check (kind in ('entrevista', 'excel', 'ingles', 'tecnica', 'caso_practico', 'assessment_center', 'campo', 'referencias', 'psicometrica', 'otra')),
  add column criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) <= 15);
update public.assessment_types set kind = case name
  when 'Prueba de Excel' then 'excel' when 'Prueba de inglés' then 'ingles' when 'Prueba de SAP' then 'tecnica'
  when 'Prueba de campo' then 'campo' when 'Prueba psicométrica' then 'psicometrica' else kind end;
insert into public.assessment_types (name, description, kind, max_score, pass_score, criteria)
values
  ('Entrevista por competencias', 'Evaluación estructurada de las competencias del puesto.', 'entrevista', 100, 70,
   '[{"name":"Comunicación","weight":1},{"name":"Orientación a resultados","weight":1},{"name":"Trabajo en equipo","weight":1},{"name":"Resolución de problemas","weight":1}]'),
  ('Prueba técnica', 'Conocimientos técnicos específicos del puesto.', 'tecnica', 100, 70, '[]'),
  ('Caso práctico', 'Resolución de un caso real del puesto.', 'caso_practico', 100, 70,
   '[{"name":"Análisis","weight":2},{"name":"Propuesta de solución","weight":2},{"name":"Presentación","weight":1}]'),
  ('Assessment center', 'Ejercicios grupales e individuales observados por evaluadores.', 'assessment_center', 100, 70, '[]'),
  ('Verificación de referencias', 'Confirmación de experiencia y desempeño con referencias laborales.', 'referencias', null, null, '[]')
on conflict (name) do nothing;

alter table public.vacancy_assessments
  add column weight numeric(6, 2) not null default 1 check (weight between 0 and 100),
  add column criteria jsonb check (criteria is null or (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) <= 15)),
  add column criteria_approved_by uuid references public.profiles (id) on delete set null,
  add column criteria_approved_at timestamptz;

create or replace function private.vacancy_assessments_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- La aprobación de criterios la registra la BD con el usuario real; cambiar los criterios la invalida.
  if new.criteria_approved_at is not null and (tg_op = 'INSERT' or old.criteria_approved_at is null or new.criteria is distinct from old.criteria) then
    if tg_op = 'UPDATE' and old.criteria_approved_at is not null and new.criteria is distinct from old.criteria then
      new.criteria_approved_at := null;
      new.criteria_approved_by := null;
    else
      new.criteria_approved_at := now();
      new.criteria_approved_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' and new.criteria_approved_at is not null then
    new.criteria_approved_at := old.criteria_approved_at;
    new.criteria_approved_by := case when new.criteria_approved_by is null then null else old.criteria_approved_by end;
  else
    new.criteria_approved_by := null;
  end if;
  return new;
end;
$$;
create trigger vacancy_assessments_rules before insert or update on public.vacancy_assessments for each row execute function private.vacancy_assessments_rules();

-- Ponderación y criterios: los aprueba el reclutador asignado a la vacante (o coordinación/administración).
-- Solo cambia peso, criterios y aprobación; el carácter obligatorio/opcional sigue siendo de coordinación.
create or replace function public.set_vacancy_assessment_criteria(p_id uuid, p_weight numeric, p_criteria jsonb, p_approve boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  va public.vacancy_assessments%rowtype;
  v_crit jsonb;
begin
  select * into va from public.vacancy_assessments where id = p_id for update;
  if not found or not private.is_operational()
     or not (private.has_any_role('admin', 'coordinador') or private.is_assigned_to_vacancy(va.vacancy_id)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_criteria is not null and (jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) > 15 or exists (
       select 1 from jsonb_array_elements(p_criteria) c
       where jsonb_typeof(c) <> 'object' or char_length(btrim(coalesce(c ->> 'name', ''))) not between 1 and 80
          or coalesce(c ->> 'weight', '1') !~ '^\d{1,3}(\.\d+)?$' or coalesce(c ->> 'weight', '1')::numeric not between 0.1 and 100)) then
    raise exception 'Criterios inválidos: hasta 15, con nombre y peso entre 0,1 y 100' using errcode = '23514';
  end if;
  v_crit := case when p_criteria is null or jsonb_array_length(p_criteria) = 0 then null
                 else (select jsonb_agg(jsonb_build_object('name', btrim(c ->> 'name'), 'weight', coalesce((c ->> 'weight')::numeric, 1)) order by o)
                       from jsonb_array_elements(p_criteria) with ordinality x(c, o)) end;
  update public.vacancy_assessments set weight = coalesce(p_weight, weight), criteria = v_crit where id = p_id;
  if coalesce(p_approve, false) then
    update public.vacancy_assessments set criteria_approved_at = now() where id = p_id and criteria_approved_at is null;
  else
    update public.vacancy_assessments set criteria_approved_at = null where id = p_id and criteria_approved_at is not null;
  end if;
end;
$$;

alter table public.assessment_results
  add column criteria_scores jsonb check (criteria_scores is null or (jsonb_typeof(criteria_scores) = 'array' and jsonb_array_length(criteria_scores) <= 15)),
  add column normalized numeric(5, 1) check (normalized is null or normalized between 0 and 100);

-- Puntaje normalizado 0–100: criterios (escala 1–5), puntaje/máximo o nivel/nivel máximo de la escala.
create or replace function private.assessment_normalized()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t public.assessment_types%rowtype;
  v_pos integer;
  v_max integer;
begin
  select * into t from public.assessment_types where id = new.assessment_type_id;
  if new.criteria_scores is not null and jsonb_array_length(new.criteria_scores) > 0 then
    if exists (select 1 from jsonb_array_elements(new.criteria_scores) c
               where coalesce(c ->> 'score', '') !~ '^[1-5]$' or coalesce(c ->> 'weight', '1') !~ '^\d{1,3}(\.\d+)?$') then
      raise exception 'Cada criterio se califica de 1 a 5' using errcode = '23514';
    end if;
    select round(100 * sum((c ->> 'score')::numeric * coalesce((c ->> 'weight')::numeric, 1)) / nullif(5 * sum(coalesce((c ->> 'weight')::numeric, 1)), 0), 1)
      into new.normalized from jsonb_array_elements(new.criteria_scores) c;
  elsif new.score is not null and t.max_score is not null then
    new.normalized := round(100 * new.score / t.max_score, 1);
  elsif new.level_id is not null then
    select l.position, (select max(x.position) from public.proficiency_levels x where x.scale_id = l.scale_id and x.is_active)
      into v_pos, v_max from public.proficiency_levels l where l.id = new.level_id;
    new.normalized := round(100.0 * v_pos / nullif(v_max, 0), 1);
  elsif new.status = 'aprobada' then
    new.normalized := 100;
  elsif new.status in ('reprobada', 'no_presento') then
    new.normalized := 0;
  else
    new.normalized := null;
  end if;
  return new;
end;
$$;
create trigger assessment_results_normalized before insert or update on public.assessment_results
  for each row execute function private.assessment_normalized();
update public.assessment_results set updated_at = updated_at;  -- recalcula los existentes

-- Resultado ponderado: solo evaluaciones aplicables con resultado; las no aplicables no cuentan.
create or replace function public.application_assessment_summary(p_application_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with a as (select vacancy_id from public.applications where id = p_application_id),
  items as (
    select t.id, t.name, t.kind, va.requirement, va.weight, r.status, r.normalized
    from a join public.vacancy_assessments va on va.vacancy_id = a.vacancy_id
    join public.assessment_types t on t.id = va.assessment_type_id
    left join public.assessment_results r on r.application_id = p_application_id and r.assessment_type_id = va.assessment_type_id
    where va.requirement <> 'no_aplica'
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'requirement', requirement, 'weight', weight,
                                                           'status', coalesce(status, 'pendiente'), 'normalized', normalized) order by requirement, name) from items), '[]'::jsonb),
    'weighted_score', (select round(sum(normalized * weight) / nullif(sum(weight), 0), 1) from items where normalized is not null and weight > 0),
    'mandatory_pending', (select count(*) from items where requirement = 'obligatoria' and (status is null or status = 'pendiente')),
    'complete', not exists (select 1 from items where requirement = 'obligatoria' and (status is null or status = 'pendiente'))
  )
$$;

-- ---------------------------------------------------------------------
-- 5) Plantilla del informe v2 y exportación de ternas
-- ---------------------------------------------------------------------
insert into public.report_templates (name, version, header_text, footer_text, sections, is_active)
values ('Informe ejecutivo de candidato', '2026-2',
        'The People Outsourcing Company S.A. · Informe ejecutivo de candidato',
        'Documento confidencial. Contiene datos personales tratados conforme a la Ley N.° 8968. Uso exclusivo del cliente para el proceso indicado; prohibida su reproducción o distribución.',
        '[{"key":"resumen_ejecutivo","title":"Resumen ejecutivo","help":"Síntesis profesional del perfil frente a la vacante (3 a 5 líneas)."},
          {"key":"evidencias_entrevista","title":"Evidencias de la entrevista","help":"Hechos concretos relatados por el candidato que respaldan su experiencia."},
          {"key":"casos_practicos","title":"Casos prácticos","help":"Resultado y observaciones de los casos prácticos, si se aplicaron."},
          {"key":"fortalezas","title":"Fortalezas destacadas","help":"Una por línea."},
          {"key":"aspectos_por_validar","title":"Aspectos por validar","help":"Información pendiente de confirmar con el candidato o sus referencias. Una por línea."},
          {"key":"disponibilidad","title":"Disponibilidad y condiciones laborales","help":"Fecha de inicio, horario, traslado y condiciones acordadas (sin datos sensibles innecesarios)."},
          {"key":"conclusion","title":"Conclusión y recomendación del reclutador","help":"Valoración final fundamentada."}]'::jsonb, false);
do $$
begin
  -- Solo reemplaza la plantilla provisional; si administración ya publicó otra, se respeta.
  if exists (select 1 from public.report_templates where is_active and version like '%PROVISIONAL%') then
    update public.report_templates set is_active = false where is_active;
    update public.report_templates set is_active = true where version = '2026-2';
  end if;
end;
$$;

create or replace function public.log_terna_export(p_vacancy_id uuid, p_application_ids uuid[], p_format text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_format not in ('docx', 'pdf') or cardinality(p_application_ids) not between 2 and 6 then
    raise exception 'Seleccione de 2 a 6 candidatos' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_application_ids) x
             where not exists (select 1 from public.applications a where a.id = x and a.vacancy_id = p_vacancy_id)
                or not private.can_view_application_detail(x)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values ('exportar', 'terna', p_vacancy_id, format('Informe comparativo de terna (%s)', upper(p_format)), cardinality(p_application_ids), auth.uid());
end;
$$;

-- Permisos de funciones
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.confirm_cv_profile(uuid, boolean)', 'public.ai_tag_request(uuid, uuid, uuid)', 'public.ai_find_reusable(text, uuid, text)',
    'public.create_ai_batch(uuid, numeric)', 'public.next_ai_batch_item(uuid)', 'public.finish_ai_batch_item(uuid, text, uuid, text)',
    'public.cancel_ai_batch(uuid)', 'public.application_assessment_summary(uuid)', 'public.set_vacancy_assessment_criteria(uuid, numeric, jsonb, boolean)', 'public.log_terna_export(uuid, uuid[], text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke all on function private.cv_profiles_rules(), private.vacancy_assessments_rules(), private.assessment_normalized() from public, anon, authenticated;
