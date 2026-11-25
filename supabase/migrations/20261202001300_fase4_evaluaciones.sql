-- =====================================================================
-- TPC Recruitment Hub — Fase 4: entrevistas, evaluaciones, credenciales
-- e informe ejecutivo. Migración 1300 (incremental y compatible).
--   1. Banco de preguntas por puesto y cliente; entrevistas con guion.
--   2. Tipos de evaluación (Excel, inglés, SAP, campo…), configuración
--      por vacante (obligatoria / deseable / no aplica) y resultados.
--   3. Credenciales con vigencia (licencias, carné de manipulación de
--      alimentos, certificaciones) y alertas de vencimiento.
--   4. Plantilla del informe ejecutivo (provisional hasta recibir el
--      machote oficial de TPC), informes versionados y exportación
--      registrada en access_logs.
-- Sin acceso anónimo. El rol consulta no ve entrevistas, evaluaciones,
-- credenciales ni informes.
-- Verificación: supabase/verification/1300_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Ayudantes de autorización
-- ---------------------------------------------------------------------
create or replace function private.is_operational()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador', 'reclutador')
$$;
revoke all on function private.is_operational() from public;
grant execute on function private.is_operational() to authenticated;

-- Detalle de una postulación (entrevistas, evaluaciones, informes): mismo criterio que el seguimiento (1100).
create or replace function private.can_view_application_detail(p_application_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_application(p_application_id)
$$;
revoke all on function private.can_view_application_detail(uuid) from public;
grant execute on function private.can_view_application_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1) Catálogos: preguntas, tipos de evaluación y de credencial
-- ---------------------------------------------------------------------
create table public.interview_questions (
  id           uuid primary key default gen_random_uuid(),
  text         text not null check (char_length(text) between 5 and 500),
  category     text not null default 'competencia'
               check (category in ('competencia', 'tecnica', 'motivacional', 'situacional', 'cultura', 'otra')),
  guidance     text check (guidance is null or char_length(guidance) <= 1000),   -- qué buscar en la respuesta
  position_id  uuid references public.job_positions (id) on delete restrict,     -- null: cualquier puesto
  client_id    uuid references public.clients (id) on delete restrict,           -- null: cualquier cliente
  sort_order   smallint not null default 50,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index interview_questions_scope_idx on public.interview_questions (position_id, client_id) where is_active;

create table public.assessment_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(name) between 2 and 100),
  description  text check (description is null or char_length(description) <= 500),
  scale_id     uuid references public.proficiency_scales (id) on delete restrict,  -- resultado con nivel
  max_score    numeric check (max_score is null or max_score > 0),               -- resultado con puntaje
  pass_score   numeric check (pass_score is null or pass_score >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (pass_score is null or (max_score is not null and pass_score <= max_score))
);

create table public.credential_types (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique check (char_length(name) between 2 and 100),
  requires_expiry boolean not null default true,
  alert_days     smallint not null default 30 check (alert_days between 0 and 365),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

insert into public.assessment_types (name, description, scale_id, max_score, pass_score)
values
  ('Prueba de Excel', 'Prueba práctica de Excel de TPC (cargar el instrumento oficial).', (select id from public.proficiency_scales where name = 'Dominio general'), 100, 70),
  ('Prueba de inglés', 'Prueba de inglés de TPC con nivel MCER.', (select id from public.proficiency_scales where name = 'Idiomas (MCER)'), 100, null),
  ('Prueba de SAP', 'Conocimiento del módulo requerido por la vacante.', (select id from public.proficiency_scales where name = 'Dominio general'), 100, 70),
  ('Prueba de campo', 'Prueba práctica en el lugar de trabajo.', null, 100, 70),
  ('Prueba psicométrica', 'Resultado global del instrumento aplicado.', null, null, null);

insert into public.credential_types (name, requires_expiry, alert_days)
values
  ('Licencia de conducir A', true, 30), ('Licencia de conducir B1', true, 30), ('Licencia de conducir B2', true, 30),
  ('Licencia de conducir C1', true, 30), ('Carné de manipulación de alimentos', true, 30),
  ('Certificado de antecedentes penales', true, 15), ('Título académico', false, 0), ('Certificación técnica', true, 60);

insert into public.interview_questions (text, category, guidance, sort_order)
values
  ('Cuénteme sobre su experiencia laboral más reciente y sus principales responsabilidades.', 'competencia', 'Claridad, logros concretos y relación con el puesto.', 10),
  ('Describa una situación difícil con un cliente o compañero y cómo la resolvió.', 'situacional', 'Método STAR: situación, tarea, acción y resultado.', 20),
  ('¿Qué le motiva de esta oportunidad?', 'motivacional', 'Interés genuino y conocimiento del puesto.', 30),
  ('¿Cuál es su disponibilidad de horario y de inicio?', 'otra', 'Compatibilidad con la vacante.', 40);

do $$
declare
  t text;
begin
  foreach t in array array['interview_questions', 'assessment_types', 'credential_types'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "%1$s: leer (operativo)" on public.%1$I for select to authenticated using ((select private.is_operational()))', t);
    execute format('create policy "%1$s: crear (admin, coord)" on public.%1$I for insert to authenticated with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
    execute format('create policy "%1$s: editar (admin, coord)" on public.%1$I for update to authenticated using ((select private.has_any_role(''admin'', ''coordinador''))) with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
  end loop;
end;
$$;
create trigger interview_questions_set_created_by before insert on public.interview_questions for each row execute function private.set_created_by();

-- ---------------------------------------------------------------------
-- 2) Evaluaciones por vacante y resultados
-- ---------------------------------------------------------------------
create table public.vacancy_assessments (
  id                 uuid primary key default gen_random_uuid(),
  vacancy_id         uuid not null references public.vacancies (id) on delete cascade,
  assessment_type_id uuid not null references public.assessment_types (id) on delete restrict,
  requirement        text not null default 'obligatoria' check (requirement in ('obligatoria', 'deseable', 'no_aplica')),
  min_level_id       uuid references public.proficiency_levels (id) on delete restrict,
  created_at         timestamptz not null default now(),
  unique (vacancy_id, assessment_type_id)
);

create table public.assessment_results (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references public.applications (id) on delete cascade,
  assessment_type_id uuid not null references public.assessment_types (id) on delete restrict,
  status             text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'reprobada', 'no_presento')),
  score              numeric check (score is null or score >= 0),
  level_id           uuid references public.proficiency_levels (id) on delete restrict,
  evaluated_on       date,
  notes              text check (notes is null or char_length(notes) <= 1000),
  evaluator_id       uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now(),
  unique (application_id, assessment_type_id)
);

-- Coherencia: nivel de la escala del tipo, puntaje dentro del máximo, resultado con fecha.
create or replace function private.assessment_results_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t public.assessment_types%rowtype;
begin
  select * into t from public.assessment_types where id = new.assessment_type_id;
  if tg_op = 'UPDATE' and (new.application_id <> old.application_id or new.assessment_type_id <> old.assessment_type_id) then
    raise exception 'Un resultado no cambia de postulación ni de tipo de evaluación' using errcode = '23514';
  end if;
  if new.level_id is not null and (t.scale_id is null or not exists (
       select 1 from public.proficiency_levels l where l.id = new.level_id and l.scale_id = t.scale_id)) then
    raise exception 'El nivel no corresponde a la escala de la evaluación' using errcode = '23514';
  end if;
  if new.score is not null and t.max_score is not null and new.score > t.max_score then
    raise exception 'El puntaje supera el máximo de la evaluación (%)', t.max_score using errcode = '23514';
  end if;
  if new.status in ('aprobada', 'reprobada') and new.evaluated_on is null then
    new.evaluated_on := (now() at time zone 'America/Costa_Rica')::date;
  end if;
  if new.evaluated_on is not null and new.evaluated_on > (now() at time zone 'America/Costa_Rica')::date then
    raise exception 'La fecha de la evaluación no puede ser futura' using errcode = '23514';
  end if;
  -- Evaluador: quien registra o cambia el resultado (no se suplanta). Si solo se anula la referencia
  -- (usuario eliminado: ON DELETE SET NULL), se respeta.
  if tg_op = 'INSERT' or (new.status, new.score, new.level_id, new.evaluated_on, new.notes)
                          is distinct from (old.status, old.score, old.level_id, old.evaluated_on, old.notes) then
    new.evaluator_id := coalesce(auth.uid(), new.evaluator_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger assessment_results_rules before insert or update on public.assessment_results
  for each row execute function private.assessment_results_rules();

-- ---------------------------------------------------------------------
-- 3) Entrevistas con guion de preguntas
-- ---------------------------------------------------------------------
create table public.interviews (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  kind            text not null default 'virtual' check (kind in ('telefonica', 'virtual', 'presencial', 'cliente')),
  scheduled_at    timestamptz not null,
  duration_min    smallint not null default 45 check (duration_min between 10 and 480),
  location        text check (location is null or char_length(location) <= 300),   -- sala o enlace de reunión
  interviewer_id  uuid references public.profiles (id) on delete set null,
  status          text not null default 'programada' check (status in ('programada', 'realizada', 'cancelada', 'no_asistio')),
  rating          smallint check (rating is null or rating between 1 and 5),
  recommendation  text check (recommendation is null or recommendation in ('recomendado', 'con_reservas', 'no_recomendado')),
  summary         text check (summary is null or char_length(summary) <= 4000),
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'realizada' or recommendation is not null)
);
create index interviews_application_idx on public.interviews (application_id, scheduled_at);
create index interviews_interviewer_idx on public.interviews (interviewer_id, scheduled_at) where status = 'programada';

create table public.interview_answers (
  interview_id   uuid not null references public.interviews (id) on delete cascade,
  position       smallint not null check (position between 1 and 60),
  question_id    uuid references public.interview_questions (id) on delete set null,
  question_text  text not null check (char_length(question_text) between 1 and 500),
  guidance       text,
  notes          text check (notes is null or char_length(notes) <= 2000),
  rating         smallint check (rating is null or rating between 1 and 5),
  primary key (interview_id, position)
);

create or replace function private.interviews_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.application_id <> old.application_id then
    raise exception 'Una entrevista no cambia de postulación' using errcode = '23514';
  end if;
  if new.status = 'realizada' and (tg_op = 'INSERT' or old.status <> 'realizada') then
    new.completed_at := now();
  elsif new.status <> 'realizada' then
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger interviews_rules before insert or update on public.interviews for each row execute function private.interviews_rules();
create trigger interviews_set_created_by before insert on public.interviews for each row execute function private.set_created_by();

-- Al programar, se arma el guion con las preguntas activas aplicables (general → puesto → cliente).
create or replace function private.interviews_seed_questions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pos uuid;
  v_client uuid;
begin
  select v.position_id, r.client_id into v_pos, v_client
  from public.applications a join public.vacancies v on v.id = a.vacancy_id join public.requisitions r on r.id = v.requisition_id
  where a.id = new.application_id;
  insert into public.interview_answers (interview_id, position, question_id, question_text, guidance)
  select new.id, row_number() over (order by (q.client_id is not null), (q.position_id is not null), q.sort_order, q.created_at), q.id, q.text, q.guidance
  from public.interview_questions q
  where q.is_active
    and (q.position_id is null or q.position_id = v_pos)
    and (q.client_id is null or q.client_id = v_client)
  order by 2
  limit 60;
  return new;
end;
$$;
create trigger interviews_seed_questions after insert on public.interviews for each row execute function private.interviews_seed_questions();

-- ---------------------------------------------------------------------
-- 4) Credenciales con vigencia (y archivos de respaldo)
-- ---------------------------------------------------------------------
alter table public.candidate_documents drop constraint if exists candidate_documents_kind_check;
alter table public.candidate_documents add constraint candidate_documents_kind_check check (kind in ('curriculum', 'credencial', 'otro'));
alter table public.candidate_documents drop constraint if exists candidate_documents_mime_check;
alter table public.candidate_documents add constraint candidate_documents_mime_check check (mime in (
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'));

create table public.candidate_credentials (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references public.candidates (id) on delete cascade,
  credential_type_id uuid not null references public.credential_types (id) on delete restrict,
  identifier         text check (identifier is null or char_length(identifier) <= 60),   -- número de licencia o carné
  issued_on          date,
  expires_on         date,
  document_id        uuid references public.candidate_documents (id) on delete set null,
  verified_by        uuid references public.profiles (id) on delete set null,
  verified_at        timestamptz,
  notes              text check (notes is null or char_length(notes) <= 500),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index candidate_credentials_candidate_idx on public.candidate_credentials (candidate_id);
create index candidate_credentials_expiry_idx on public.candidate_credentials (expires_on) where expires_on is not null;

create or replace function private.candidate_credentials_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t public.credential_types%rowtype;
begin
  select * into t from public.credential_types where id = new.credential_type_id;
  if t.requires_expiry and new.expires_on is null then
    raise exception 'Indique la fecha de vencimiento de «%»', t.name using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.candidate_id <> old.candidate_id then
    raise exception 'Una credencial no cambia de candidato' using errcode = '23514';
  end if;
  if new.document_id is not null and not exists (
       select 1 from public.candidate_documents d where d.id = new.document_id and d.candidate_id = new.candidate_id) then
    raise exception 'El archivo no pertenece al candidato' using errcode = '23514';
  end if;
  -- Verificación: la registra la BD con el usuario y la hora (no se suplanta)
  if new.verified_at is not null and (tg_op = 'INSERT' or old.verified_at is null) then
    new.verified_by := auth.uid();
    new.verified_at := now();
  elsif tg_op = 'UPDATE' and new.verified_at is not null then
    -- La verificación no se altera; solo se admite anular el verificador si su usuario se eliminó.
    new.verified_by := case when new.verified_by is null then null else old.verified_by end;
    new.verified_at := old.verified_at;
  else
    new.verified_by := null;
  end if;
  return new;
end;
$$;
create trigger candidate_credentials_rules before insert or update on public.candidate_credentials
  for each row execute function private.candidate_credentials_rules();
create trigger candidate_credentials_set_created_by before insert on public.candidate_credentials
  for each row execute function private.set_created_by();

-- Carga de archivos del personal: currículum, respaldo de credencial u otro (PDF, Word, JPG o PNG).
create or replace function private.can_write_candidate_cv(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  return cardinality(parts) = 3 and parts[1] = 'candidatos' and parts[2] ~ '^[0-9a-f-]{36}$'
     and parts[3] ~ '^[0-9a-f-]{36}\.(pdf|docx|jpg|png)$'
     and (private.can_edit_candidate(parts[2]::uuid)
          or (private.is_operational() and private.can_view_candidate_private(parts[2]::uuid)));
end;
$$;

create or replace function public.register_candidate_file(p_candidate_id uuid, p_path text, p_file_name text, p_mime text, p_size integer, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_exists boolean := true;
begin
  if not (private.can_edit_candidate(p_candidate_id) or (private.is_operational() and private.can_view_candidate_private(p_candidate_id))) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_kind not in ('curriculum', 'credencial', 'otro') then
    raise exception 'Tipo de documento no válido' using errcode = '22023';
  end if;
  if p_path !~ ('^candidatos/' || p_candidate_id::text || '/[0-9a-f-]{36}\.(pdf|docx|jpg|png)$') then
    raise exception 'Ruta de archivo no válida' using errcode = '23514';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into v_exists using 'curriculums', p_path;
  end if;
  if not v_exists then
    raise exception 'No se encontró el archivo cargado' using errcode = '23514';
  end if;
  insert into public.candidate_documents (candidate_id, kind, storage_path, file_name, mime, size_bytes, source, uploaded_by)
  values (p_candidate_id, p_kind, p_path,
          left(regexp_replace(coalesce(nullif(btrim(p_file_name), ''), 'documento'), '[^0-9A-Za-zÁÉÍÓÚáéíóúÑñ ._-]', '', 'g'), 150),
          p_mime, p_size, 'personal', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set allowed_mime_types = array[
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']
    where id = 'curriculums';
  end if;
end;
$$;

-- Credenciales por vencer o vencidas visibles para el usuario (alertas).
create or replace function public.expiring_credentials(p_days integer default 30)
returns table (credential_id uuid, candidate_id uuid, candidate_name text, credential text, expires_on date, days_left integer)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.candidate_id, k.first_name || ' ' || k.last_name, t.name, c.expires_on,
         (c.expires_on - (now() at time zone 'America/Costa_Rica')::date)::integer
  from public.candidate_credentials c
  join public.credential_types t on t.id = c.credential_type_id
  join public.candidates k on k.id = c.candidate_id
  where c.expires_on is not null
    and c.expires_on <= (now() at time zone 'America/Costa_Rica')::date + greatest(least(coalesce(p_days, 30), 365), 0)
    and k.status <> 'fusionado'
  order by c.expires_on
  limit 500
$$;

-- ---------------------------------------------------------------------
-- 5) Informe ejecutivo
-- ---------------------------------------------------------------------
create table public.report_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 3 and 150),
  version      text not null check (char_length(version) between 1 and 30),
  header_text  text check (header_text is null or char_length(header_text) <= 500),
  footer_text  text check (footer_text is null or char_length(footer_text) <= 500),
  sections     jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 20),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index report_templates_one_active on public.report_templates ((true)) where is_active;

insert into public.report_templates (name, version, header_text, footer_text, sections, is_active)
values ('Informe ejecutivo de candidato (provisional)', '2026-1-PROVISIONAL',
        'The People Outsourcing Company S.A. · Informe ejecutivo de candidato',
        'Documento confidencial. Contiene datos personales tratados conforme a la Ley N.° 8968. Uso exclusivo del cliente para el proceso indicado.',
        '[{"key":"perfil","title":"Perfil del candidato","help":"Formación, experiencia relevante y trayectoria."},
          {"key":"competencias","title":"Competencias observadas","help":"Fortalezas y aspectos a desarrollar observados en la entrevista."},
          {"key":"evaluaciones","title":"Resultados de evaluaciones","help":"Se completa automáticamente con las pruebas registradas; puede ampliarse."},
          {"key":"entrevista","title":"Resumen de la entrevista","help":"Hallazgos principales de la(s) entrevista(s)."},
          {"key":"condiciones","title":"Disponibilidad y condiciones","help":"Disponibilidad de inicio, horario y otras condiciones relevantes (sin datos sensibles innecesarios)."},
          {"key":"recomendacion","title":"Recomendación","help":"Conclusión del reclutador para el cliente."}]'::jsonb, true);

create table public.executive_reports (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  template_id     uuid not null references public.report_templates (id) on delete restrict,
  status          text not null default 'borrador' check (status in ('borrador', 'final')),
  version         integer not null default 1 check (version >= 1),
  content         jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 60000),
  recommendation  text check (recommendation is null or recommendation in ('recomendado', 'con_reservas', 'no_recomendado')),
  finalized_by    uuid references public.profiles (id) on delete set null,
  finalized_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id)
);

-- Un informe final no se edita; reabrirlo (solo admin/coord) crea una versión nueva.
create or replace function private.executive_reports_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.application_id <> old.application_id or new.template_id <> old.template_id then
      raise exception 'El informe no cambia de postulación ni de plantilla' using errcode = '23514';
    end if;
    if old.status = 'final' and new.status = 'final' then
      -- Única excepción: anular referencias a usuarios eliminados (ON DELETE SET NULL).
      if new.content is distinct from old.content or new.recommendation is distinct from old.recommendation
         or new.finalized_at is distinct from old.finalized_at
         or (new.finalized_by is not null and new.finalized_by is distinct from old.finalized_by)
         or (new.created_by is not null and new.created_by is distinct from old.created_by) then
        raise exception 'El informe final no se modifica: reábralo para crear una versión nueva' using errcode = '23514';
      end if;
      new.version := old.version;
      return new;
    end if;
    if old.status = 'final' and new.status = 'borrador' then
      if not private.has_any_role('admin', 'coordinador') then
        raise exception 'Solo coordinación o administración reabren un informe final' using errcode = '42501';
      end if;
      new.version := old.version + 1;
      new.finalized_by := null;
      new.finalized_at := null;
    elsif old.status = 'borrador' and new.status = 'final' then
      if new.recommendation is null then
        raise exception 'Indique la recomendación antes de finalizar el informe' using errcode = '23514';
      end if;
      new.finalized_by := auth.uid();
      new.finalized_at := now();
      new.version := old.version;
    else
      new.version := old.version;
      new.finalized_by := old.finalized_by;
      new.finalized_at := old.finalized_at;
    end if;
  else
    if new.status <> 'borrador' then
      raise exception 'El informe se crea en borrador' using errcode = '23514';
    end if;
    new.version := 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger executive_reports_rules before insert or update on public.executive_reports
  for each row execute function private.executive_reports_rules();
create trigger executive_reports_set_created_by before insert on public.executive_reports
  for each row execute function private.set_created_by();

-- Exportación registrada (Word o PDF): solo informes finales y quien puede ver la postulación.
create or replace function public.log_report_export(p_report_id uuid, p_format text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.executive_reports%rowtype;
begin
  select * into r from public.executive_reports where id = p_report_id;
  if not found or not private.can_view_application_detail(r.application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_format not in ('docx', 'pdf') then
    raise exception 'Formato no válido' using errcode = '22023';
  end if;
  if r.status <> 'final' then
    raise exception 'Solo se exporta el informe final' using errcode = '23514';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values ('exportar', 'informe_ejecutivo', r.id, format('Informe ejecutivo v%s (%s)', r.version, upper(p_format)), 1, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- 6) RLS de las tablas de detalle
-- ---------------------------------------------------------------------
alter table public.vacancy_assessments enable row level security;
alter table public.vacancy_assessments force row level security;
revoke all on public.vacancy_assessments from anon, authenticated;
grant select, insert, update, delete on public.vacancy_assessments to authenticated;
create policy "vacancy_assessments: leer (activos)" on public.vacancy_assessments for select to authenticated using ((select private.is_active_user()));
create policy "vacancy_assessments: crear (admin, coord)" on public.vacancy_assessments for insert to authenticated with check ((select private.has_any_role('admin', 'coordinador')));
create policy "vacancy_assessments: editar (admin, coord)" on public.vacancy_assessments for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador'))) with check ((select private.has_any_role('admin', 'coordinador')));
create policy "vacancy_assessments: quitar (admin, coord)" on public.vacancy_assessments for delete to authenticated using ((select private.has_any_role('admin', 'coordinador')));

do $$
declare
  t text;
begin
  foreach t in array array['assessment_results', 'interviews', 'executive_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "%1$s: leer" on public.%1$I for select to authenticated using (private.can_view_application_detail(application_id))', t);
    execute format('create policy "%1$s: crear" on public.%1$I for insert to authenticated with check (private.can_view_application_detail(application_id))', t);
    execute format('create policy "%1$s: editar" on public.%1$I for update to authenticated using (private.can_view_application_detail(application_id)) with check (private.can_view_application_detail(application_id))', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
  end loop;
end;
$$;
create trigger vacancy_assessments_audit after insert or update or delete on public.vacancy_assessments
  for each row execute function private.write_audit_log();

alter table public.interview_answers enable row level security;
alter table public.interview_answers force row level security;
revoke all on public.interview_answers from anon, authenticated;
grant select, insert, update on public.interview_answers to authenticated;
create policy "interview_answers: leer" on public.interview_answers for select to authenticated
  using (exists (select 1 from public.interviews i where i.id = interview_id));
create policy "interview_answers: crear" on public.interview_answers for insert to authenticated
  with check (exists (select 1 from public.interviews i where i.id = interview_id and private.can_view_application_detail(i.application_id)));
create policy "interview_answers: editar" on public.interview_answers for update to authenticated
  using (exists (select 1 from public.interviews i where i.id = interview_id and private.can_view_application_detail(i.application_id)))
  with check (exists (select 1 from public.interviews i where i.id = interview_id and private.can_view_application_detail(i.application_id)));

alter table public.candidate_credentials enable row level security;
alter table public.candidate_credentials force row level security;
revoke all on public.candidate_credentials from anon, authenticated;
grant select, insert, update on public.candidate_credentials to authenticated;
create policy "candidate_credentials: leer" on public.candidate_credentials for select to authenticated
  using (private.is_operational() and private.can_view_candidate_private(candidate_id));
create policy "candidate_credentials: crear" on public.candidate_credentials for insert to authenticated
  with check (private.is_operational() and private.can_view_candidate_private(candidate_id));
create policy "candidate_credentials: editar" on public.candidate_credentials for update to authenticated
  using (private.is_operational() and private.can_view_candidate_private(candidate_id))
  with check (private.is_operational() and private.can_view_candidate_private(candidate_id));
create trigger candidate_credentials_audit after insert or update or delete on public.candidate_credentials
  for each row execute function private.write_audit_log();

alter table public.report_templates enable row level security;
alter table public.report_templates force row level security;
revoke all on public.report_templates from anon, authenticated;
grant select, insert, update on public.report_templates to authenticated;
create policy "report_templates: leer (operativo)" on public.report_templates for select to authenticated using ((select private.is_operational()));
create policy "report_templates: crear (admin)" on public.report_templates for insert to authenticated with check ((select private.has_any_role('admin')));
create policy "report_templates: editar (admin)" on public.report_templates for update to authenticated
  using ((select private.has_any_role('admin'))) with check ((select private.has_any_role('admin')));
create trigger report_templates_audit after insert or update or delete on public.report_templates
  for each row execute function private.write_audit_log();

-- Permisos de funciones
revoke all on function public.register_candidate_file(uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.register_candidate_file(uuid, text, text, text, integer, text) to authenticated;
revoke all on function public.log_report_export(uuid, text) from public, anon;
grant execute on function public.log_report_export(uuid, text) to authenticated;
revoke all on function public.expiring_credentials(integer) from public, anon;
grant execute on function public.expiring_credentials(integer) to authenticated;
revoke all on function private.assessment_results_rules(), private.interviews_rules(), private.interviews_seed_questions(),
  private.candidate_credentials_rules(), private.executive_reports_rules() from public, anon, authenticated;
