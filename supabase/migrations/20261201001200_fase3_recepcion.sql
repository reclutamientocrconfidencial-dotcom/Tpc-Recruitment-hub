-- =====================================================================
-- TPC Recruitment Hub — Fase 3: recepción de candidatos.
-- Migración 1200:
--   1. Formularios públicos por vacante (y del banco de talento) con
--      preguntas de preselección configurables.
--   2. Enlaces por canal de recepción (con código para QR).
--   3. Envíos: solo los acepta el servidor de la aplicación (clave de
--      servidor guardada como huella), con límites de frecuencia,
--      consentimiento digital y evidencia.
--   4. Incorporación automática a la base madre si no hay coincidencias;
--      con posibles duplicados, el envío queda en la bandeja para revisión.
--   5. Currículums en almacenamiento privado: carga con token de un solo
--      uso, lectura solo por personal autorizado y descarga registrada.
--
-- Sin acceso anónimo a tablas: el público solo usa funciones acotadas.
-- Verificación: supabase/verification/1200_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Clave de servidor para formularios públicos (solo su huella SHA-256)
-- ---------------------------------------------------------------------
create table private.public_form_settings (
  id          boolean primary key default true check (id),
  key_hash    text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  updated_at  timestamptz not null default now()
);
revoke all on private.public_form_settings from public, anon, authenticated;

-- Configuración (SQL Editor, como administrador de la base de datos):
--   select private.set_public_form_key('<clave larga aleatoria>');
-- La misma clave se guarda como secreto PUBLIC_FORM_KEY del Worker. Nunca en el repositorio.
create or replace function private.set_public_form_key(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_key, '')) < 32 then
    raise exception 'La clave debe tener al menos 32 caracteres' using errcode = '22023';
  end if;
  insert into private.public_form_settings (id, key_hash, updated_at)
  values (true, encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), now())
  on conflict (id) do update set key_hash = excluded.key_hash, updated_at = now();
end;
$$;
revoke all on function private.set_public_form_key(text) from public, anon, authenticated;

create or replace function private.valid_public_form_key(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.public_form_settings s
                 where s.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'))
$$;
revoke all on function private.valid_public_form_key(text) from public, anon, authenticated;

create or replace function private.random_code()
returns text language sql volatile set search_path = '' as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
$$;
revoke all on function private.random_code() from public, anon;
grant execute on function private.random_code() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Formularios, preguntas y enlaces
-- ---------------------------------------------------------------------
create table public.public_forms (
  id           uuid primary key default gen_random_uuid(),
  vacancy_id   uuid unique references public.vacancies (id) on delete cascade,  -- null: banco de talento
  title        text not null check (char_length(title) between 3 and 150),
  intro        text check (intro is null or char_length(intro) <= 2000),
  require_cv   boolean not null default true,
  is_active    boolean not null default true,
  closes_at    date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.public_forms is 'Formularios públicos de postulación (por vacante o del banco de talento).';

create table public.form_questions (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null references public.public_forms (id) on delete cascade,
  position        smallint not null check (position between 1 and 30),
  label           text not null check (char_length(label) between 3 and 300),
  kind            text not null check (kind in ('si_no', 'opcion', 'numero', 'texto')),
  options         text[] not null default '{}',
  required        boolean not null default true,
  expected_answer text check (expected_answer is null or char_length(expected_answer) <= 100),  -- si_no / opción que cumple
  min_number      numeric check (min_number is null or min_number >= 0),                       -- número mínimo que cumple
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  check (kind <> 'opcion' or cardinality(options) between 2 and 20),
  check (expected_answer is null or kind in ('si_no', 'opcion')),
  check (min_number is null or kind = 'numero')
);
create index form_questions_form_idx on public.form_questions (form_id, position);

create table public.form_links (
  id                uuid primary key default gen_random_uuid(),
  form_id           uuid not null references public.public_forms (id) on delete cascade,
  code              text not null unique default private.random_code() check (code ~ '^[a-z0-9]{8,32}$'),
  intake_channel_id uuid not null references public.intake_channels (id) on delete restrict,
  label             text check (label is null or char_length(label) <= 100),
  is_active         boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index form_links_form_idx on public.form_links (form_id);

do $$
declare
  t text;
begin
  foreach t in array array['public_forms', 'form_questions', 'form_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "%1$s: leer (operativo)" on public.%1$I for select to authenticated using ((select private.has_any_role(''admin'', ''coordinador'', ''reclutador'')))', t);
    execute format('create policy "%1$s: crear (admin, coord)" on public.%1$I for insert to authenticated with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
    execute format('create policy "%1$s: editar (admin, coord)" on public.%1$I for update to authenticated using ((select private.has_any_role(''admin'', ''coordinador''))) with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
  end loop;
end;
$$;
create trigger public_forms_set_created_by before insert on public.public_forms for each row execute function private.set_created_by();
create trigger form_links_set_created_by before insert on public.form_links for each row execute function private.set_created_by();
create trigger public_forms_set_updated_at before update on public.public_forms for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) Envíos (bandeja de recepción), respuestas y documentos
-- ---------------------------------------------------------------------
create table public.intake_submissions (
  id                 uuid primary key default gen_random_uuid(),
  link_id            uuid not null references public.form_links (id) on delete restrict,
  form_id            uuid not null references public.public_forms (id) on delete restrict,
  vacancy_id         uuid references public.vacancies (id) on delete set null,
  intake_channel_id  uuid references public.intake_channels (id) on delete set null,
  status             text not null check (status in ('incorporado', 'revision', 'vinculado', 'creado', 'descartado')),
  full_name          text not null check (char_length(full_name) between 2 and 260),
  data               jsonb,                 -- datos personales; se eliminan al resolver el envío
  match_candidate_id uuid references public.candidates (id) on delete set null,
  match_reasons      text[] not null default '{}',
  candidate_id       uuid references public.candidates (id) on delete set null,
  application_id     uuid references public.applications (id) on delete set null,
  consent_text_id    uuid not null references public.consent_texts (id) on delete restrict,
  consent_evidence   text not null check (char_length(consent_evidence) <= 300),
  preselection_ok    boolean,
  ip_hash            text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$'),
  upload_token_hash  text check (upload_token_hash is null or upload_token_hash ~ '^[0-9a-f]{64}$'),
  cv_path            text,
  cv_mime            text,
  cv_size            integer,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text check (review_note is null or char_length(review_note) <= 300),
  created_at         timestamptz not null default now()
);
comment on table public.intake_submissions is 'Envíos de formularios públicos. Datos personales solo mientras el envío está en revisión.';
create index intake_submissions_status_idx on public.intake_submissions (status, created_at desc);
create index intake_submissions_link_idx on public.intake_submissions (link_id, created_at desc);
create index intake_submissions_ip_idx on public.intake_submissions (ip_hash, created_at desc);

create table public.submission_answers (
  submission_id  uuid not null references public.intake_submissions (id) on delete cascade,
  question_id    uuid references public.form_questions (id) on delete set null,
  position       smallint not null,
  question_label text not null,
  answer         text check (answer is null or char_length(answer) <= 1000),
  meets          boolean,
  primary key (submission_id, position)
);

create table public.candidate_documents (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  kind           text not null default 'curriculum' check (kind in ('curriculum', 'otro')),
  storage_path   text not null unique,
  file_name      text not null check (char_length(file_name) between 1 and 150),
  mime           text not null check (mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes     integer not null check (size_bytes between 1 and 5242880),
  source         text not null check (source in ('formulario', 'personal')),
  submission_id  uuid references public.intake_submissions (id) on delete set null,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index candidate_documents_candidate_idx on public.candidate_documents (candidate_id, created_at desc);

alter table public.applications
  add column intake_channel_id uuid references public.intake_channels (id) on delete set null,
  add column source_detail     text check (source_detail is null or char_length(source_detail) <= 150),
  add column submission_id     uuid references public.intake_submissions (id) on delete set null;

-- ¿Puede ver un envío? Admin/coord: todos. Reclutador: los de sus vacantes.
create or replace function private.can_view_submission(p_vacancy_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador')
      or (private.has_any_role('reclutador') and p_vacancy_id is not null and private.is_assigned_to_vacancy(p_vacancy_id))
$$;
revoke all on function private.can_view_submission(uuid) from public;
grant execute on function private.can_view_submission(uuid) to authenticated;

alter table public.intake_submissions enable row level security;
alter table public.intake_submissions force row level security;
alter table public.submission_answers enable row level security;
alter table public.submission_answers force row level security;
alter table public.candidate_documents enable row level security;
alter table public.candidate_documents force row level security;
revoke all on public.intake_submissions, public.submission_answers, public.candidate_documents from anon, authenticated;
grant select on public.intake_submissions, public.submission_answers, public.candidate_documents to authenticated;
create policy "intake_submissions: leer" on public.intake_submissions for select to authenticated
  using (private.can_view_submission(vacancy_id));
create policy "submission_answers: leer" on public.submission_answers for select to authenticated
  using (exists (select 1 from public.intake_submissions s where s.id = submission_id));
create policy "candidate_documents: leer" on public.candidate_documents for select to authenticated
  using (private.can_view_candidate_private(candidate_id));
create trigger intake_submissions_audit after insert or update or delete on public.intake_submissions
  for each row execute function private.write_audit_log();
create trigger candidate_documents_audit after insert or update or delete on public.candidate_documents
  for each row execute function private.write_audit_log();

-- ---------------------------------------------------------------------
-- 4) Formulario público (lectura anónima de lo estrictamente necesario)
-- ---------------------------------------------------------------------
create or replace function private.form_link_available(p_code text)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.id
  from public.form_links l
  join public.public_forms f on f.id = l.form_id
  left join public.vacancies v on v.id = f.vacancy_id
  where l.code = lower(btrim(coalesce(p_code, '')))
    and l.is_active and f.is_active
    and (f.closes_at is null or f.closes_at >= (now() at time zone 'America/Costa_Rica')::date)
    and (f.vacancy_id is null or v.status in ('abierta', 'pausada'))
$$;
revoke all on function private.form_link_available(text) from public, anon, authenticated;

create or replace function public.get_public_form(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_link uuid := private.form_link_available(p_code);
  r record;
begin
  if v_link is null then
    return jsonb_build_object('available', false);
  end if;
  select f.id, f.title, f.intro, f.require_cv, f.vacancy_id, v.title as vacancy_title, v.description, v.province,
         v.location_detail, v.modality, v.employment_type, v.work_schedule, v.closes_at, v.position_id
    into r
  from public.form_links l join public.public_forms f on f.id = l.form_id
  left join public.vacancies v on v.id = f.vacancy_id
  where l.id = v_link;
  return jsonb_build_object(
    'available', true,
    'title', r.title,
    'intro', r.intro,
    'require_cv', r.require_cv,
    'vacancy', case when r.vacancy_id is null then null else jsonb_build_object(
      'title', r.vacancy_title, 'description', r.description, 'province', r.province, 'location_detail', r.location_detail,
      'modality', r.modality, 'employment_type', r.employment_type, 'work_schedule', r.work_schedule, 'closes_at', r.closes_at) end,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'label', q.label, 'kind', q.kind,
                                    'options', q.options, 'required', q.required) order by q.position)
                           from public.form_questions q where q.form_id = r.id and q.is_active), '[]'::jsonb),
    'consent', (select jsonb_build_object('id', t.id, 'version', t.version, 'title', t.title, 'body', t.body)
                from public.consent_texts t where t.is_active),
    'cantons', (select jsonb_agg(jsonb_build_object('province', c.province, 'name', c.name) order by c.province, c.name) from public.cr_cantons c),
    'positions', case when r.vacancy_id is null then
                   (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb) from public.job_positions p where p.is_active)
                 else null end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Envío del formulario (solo con la clave del servidor)
-- ---------------------------------------------------------------------
-- Coincidencias para revisión (uso interno: no requiere rol).
create or replace function private.find_matches(p_national_id text, p_email text, p_phone text, p_first text, p_last text)
returns table (candidate_id uuid, reasons text[], blocking boolean)
language sql stable security definer set search_path = '' as $$
  with k as (
    select nullif(upper(regexp_replace(coalesce(p_national_id, ''), '[^0-9A-Za-z]', '', 'g')), '') as nid,
           private.norm_email(p_email) as email, private.norm_phone(p_phone) as phone, private.norm_name(p_first, p_last) as name
  )
  select c.id,
         array_remove(array[
           case when k.nid is not null and p.national_id_norm = k.nid then 'cédula' end,
           case when k.email is not null and p.email_norm = k.email then 'correo' end,
           case when k.phone is not null and (p.phone_e164 = k.phone or p.phone_alt_e164 = k.phone) then 'teléfono' end,
           case when k.name is not null and c.full_name_norm = k.name then 'nombre' end], null),
         (k.nid is not null and p.national_id_norm = k.nid)
  from k, public.candidates c left join public.candidate_private p on p.candidate_id = c.id
  where c.status <> 'fusionado'
    and ((k.nid is not null and p.national_id_norm = k.nid) or (k.email is not null and p.email_norm = k.email)
         or (k.phone is not null and (p.phone_e164 = k.phone or p.phone_alt_e164 = k.phone))
         or (k.name is not null and c.full_name_norm = k.name))
  order by 3 desc, cardinality(array_remove(array[
           case when k.email is not null and p.email_norm = k.email then 1 end,
           case when k.phone is not null and p.phone_e164 = k.phone then 1 end], null)) desc
  limit 1
$$;
revoke all on function private.find_matches(text, text, text, text, text) from public, anon, authenticated;

-- Crea el candidato (o completa el existente) y su postulación a partir de un envío.
create or replace function private.incorporate_submission(p_submission_id uuid, p_existing uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.intake_submissions%rowtype;
  d jsonb;
  v_id uuid := p_existing;
  v_pos uuid;
  v_app uuid;
  v_label text;
begin
  select * into s from public.intake_submissions where id = p_submission_id for update;
  d := s.data;
  select l.label into v_label from public.form_links l where l.id = s.link_id;
  if v_id is null then
    insert into public.candidates (first_name, last_name, province, canton, district, locality, current_title,
                                   intake_channel_id, source_detail, years_experience, owner_id)
    values (d ->> 'first_name', d ->> 'last_name', nullif(d ->> 'province', '')::public.cr_province, nullif(d ->> 'canton', ''),
            nullif(d ->> 'district', ''), nullif(d ->> 'locality', ''), nullif(d ->> 'current_title', ''),
            s.intake_channel_id, v_label, nullif(d ->> 'years_experience', '')::numeric,
            (select v.recruiter_id from public.vacancies v where v.id = s.vacancy_id))  -- responsable: reclutador de la vacante
    returning id into v_id;
    insert into public.candidate_private (candidate_id, national_id_type, national_id, email, phone)
    values (v_id, case when nullif(d ->> 'national_id', '') is not null then 'cedula' end, nullif(d ->> 'national_id', ''),
            nullif(d ->> 'email', ''), nullif(d ->> 'phone', ''));
  else
    -- Vincular: solo completa datos vacíos (nunca sobrescribe lo existente)
    update public.candidates c set
      province = coalesce(c.province, nullif(d ->> 'province', '')::public.cr_province),
      canton = coalesce(c.canton, nullif(d ->> 'canton', '')), district = coalesce(c.district, nullif(d ->> 'district', '')),
      locality = coalesce(c.locality, nullif(d ->> 'locality', '')), current_title = coalesce(c.current_title, nullif(d ->> 'current_title', '')),
      intake_channel_id = coalesce(c.intake_channel_id, s.intake_channel_id)
    where c.id = v_id;
    insert into public.candidate_private as cp (candidate_id, email, phone, national_id)
    values (v_id, nullif(d ->> 'email', ''), nullif(d ->> 'phone', ''), nullif(d ->> 'national_id', ''))
    on conflict (candidate_id) do update set
      email = coalesce(cp.email, excluded.email), phone = coalesce(cp.phone, excluded.phone),
      national_id = coalesce(cp.national_id, excluded.national_id);
  end if;

  -- Consentimiento digital con su evidencia
  insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, given_at)
  values (v_id, s.consent_text_id, 'formulario_web', s.consent_evidence, s.created_at);
  update public.candidates set status = 'activo' where id = v_id and status = 'no_contactar';

  -- Perfil profesional: puesto de la vacante o el elegido en el formulario del banco de talento
  if s.vacancy_id is not null then
    select position_id into v_pos from public.vacancies where id = s.vacancy_id;
  else
    v_pos := nullif(d ->> 'position_id', '')::uuid;
  end if;
  if v_pos is not null then
    insert into public.candidate_profiles (candidate_id, position_id, is_primary)
    values (v_id, v_pos, not exists (select 1 from public.candidate_profiles where candidate_id = v_id))
    on conflict do nothing;
  end if;

  -- Postulación a la vacante con su canal de recepción
  if s.vacancy_id is not null then
    select id into v_app from public.applications where vacancy_id = s.vacancy_id and candidate_id = v_id;
    if v_app is null and exists (select 1 from public.vacancies v where v.id = s.vacancy_id and v.status in ('abierta', 'pausada')) then
      insert into public.applications (vacancy_id, candidate_id, intake_channel_id, source_detail, submission_id)
      values (s.vacancy_id, v_id, s.intake_channel_id, v_label, s.id)
      returning id into v_app;
    end if;
  end if;

  -- Currículum ya cargado → documento del candidato
  if s.cv_path is not null and not exists (select 1 from public.candidate_documents where storage_path = s.cv_path) then
    insert into public.candidate_documents (candidate_id, storage_path, file_name, mime, size_bytes, source, submission_id)
    values (v_id, s.cv_path, 'curriculum' || case when s.cv_mime = 'application/pdf' then '.pdf' else '.docx' end, s.cv_mime, s.cv_size, 'formulario', s.id);
  end if;

  update public.intake_submissions set candidate_id = v_id, application_id = v_app, data = null where id = s.id;
  return v_id;
end;
$$;
revoke all on function private.incorporate_submission(uuid, uuid) from public, anon, authenticated;

create or replace function public.submit_public_form(p_key text, p_code text, p jsonb, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_link uuid := private.form_link_available(p_code);
  l public.form_links%rowtype;
  f public.public_forms%rowtype;
  q public.form_questions%rowtype;
  v_consent uuid;
  v_version text;
  v_answer text;
  v_meets boolean;
  v_pre boolean := true;
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_match record;
  v_status text;
  v_first text := btrim(coalesce(p ->> 'first_name', ''));
  v_last text := btrim(coalesce(p ->> 'last_name', ''));
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_phone text := btrim(coalesce(p ->> 'phone', ''));
  v_ip text := lower(nullif(btrim(coalesce(p_ip_hash, '')), ''));
  v_data jsonb;
begin
  if not private.valid_public_form_key(p_key) then
    raise exception 'Formulario no disponible' using errcode = '42501';
  end if;
  if v_link is null then
    raise exception 'Este formulario ya no recibe postulaciones' using errcode = '23514';
  end if;
  select * into l from public.form_links where id = v_link;
  select * into f from public.public_forms where id = l.form_id;

  -- Validación de datos (la aplicación ya validó; la BD vuelve a validar)
  if char_length(v_first) not between 1 and 100 or char_length(v_last) not between 1 and 150 then
    raise exception 'Indique su nombre y apellidos' using errcode = '23514';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'Indique al menos un correo o un teléfono de contacto' using errcode = '23514';
  end if;
  if v_email <> '' and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'El correo no es válido' using errcode = '23514';
  end if;
  if v_phone <> '' and private.norm_phone(v_phone) is null then
    raise exception 'El teléfono no es válido' using errcode = '23514';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'Debe aceptar el consentimiento informado para enviar su postulación' using errcode = '23514';
  end if;
  select t.id, t.version into v_consent, v_version from public.consent_texts t where t.is_active;
  if v_consent is null or (p ->> 'consent_text_id') is distinct from v_consent::text then
    raise exception 'El texto del consentimiento cambió: recargue la página' using errcode = '23514';
  end if;
  if v_ip is not null and v_ip !~ '^[0-9a-f]{16,64}$' then v_ip := null; end if;
  -- Puerta S1: sin datos reales habilitados, solo envíos ficticios (correo *.test o *.example).
  if not private.real_data_enabled() and v_email !~ '\.(test|example)$' then
    raise exception 'Ambiente de pruebas: use un correo ficticio terminado en .test' using errcode = '23514';
  end if;
  -- Con datos reales, solo con un consentimiento con aprobación jurídica.
  if private.real_data_enabled() and not exists (select 1 from public.consent_texts t where t.id = v_consent and t.legal_approved) then
    raise exception 'Este formulario no está disponible en este momento' using errcode = '23514';
  end if;

  -- Límites de frecuencia (anti-abuso)
  if v_ip is not null and (select count(*) from public.intake_submissions s where s.ip_hash = v_ip and s.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados envíos desde su conexión. Intente más tarde' using errcode = '23514';
  end if;
  if (select count(*) from public.intake_submissions s where s.link_id = l.id and s.created_at > now() - interval '1 day') >= 500 then
    raise exception 'Este formulario alcanzó su límite diario. Intente mañana' using errcode = '23514';
  end if;
  if exists (select 1 from public.intake_submissions s
             where s.form_id = f.id and s.created_at > now() - interval '1 day'
               and s.status = 'revision' and s.data is not null
               and ((v_email <> '' and lower(s.data ->> 'email') = v_email)
                    or (v_phone <> '' and private.norm_phone(s.data ->> 'phone') = private.norm_phone(v_phone)))) then
    raise exception 'Ya recibimos su postulación para este formulario' using errcode = '23514';
  end if;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'first_name', left(v_first, 100), 'last_name', left(v_last, 150),
    'email', nullif(v_email, ''), 'phone', nullif(left(v_phone, 30), ''),
    'province', nullif(left(btrim(coalesce(p ->> 'province', '')), 30), ''),
    'canton', nullif(left(btrim(coalesce(p ->> 'canton', '')), 80), ''),
    'district', nullif(left(btrim(coalesce(p ->> 'district', '')), 100), ''),
    'locality', nullif(left(btrim(coalesce(p ->> 'locality', '')), 150), ''),
    'current_title', nullif(left(btrim(coalesce(p ->> 'current_title', '')), 150), ''),
    'years_experience', case when coalesce(p ->> 'years_experience', '') ~ '^\d{1,2}(\.\d)?$' then p ->> 'years_experience' end,
    'national_id', case when coalesce(p ->> 'national_id', '') ~ '^[0-9A-Za-z\s-]{4,30}$' then btrim(p ->> 'national_id') end,
    'position_id', case when f.vacancy_id is null and coalesce(p ->> 'position_id', '') ~ '^[0-9a-f-]{36}$'
                          and exists (select 1 from public.job_positions jp where jp.id::text = p ->> 'position_id' and jp.is_active)
                        then p ->> 'position_id' end));
  if (v_data ->> 'province') is not null
     and (v_data ->> 'province') not in ('San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón') then
    raise exception 'Provincia no válida' using errcode = '23514';
  end if;

  insert into public.intake_submissions (id, link_id, form_id, vacancy_id, intake_channel_id, status, full_name, data,
                                         consent_text_id, consent_evidence, ip_hash, upload_token_hash)
  values (v_id, l.id, f.id, f.vacancy_id, l.intake_channel_id, 'revision', v_first || ' ' || v_last, v_data, v_consent,
          left(format('Formulario web «%s» · enlace %s · versión %s · %s · envío %s', f.title, l.code, v_version,
                      to_char(now() at time zone 'America/Costa_Rica', 'DD/MM/YYYY HH24:MI'), left(v_id::text, 8)), 300),
          v_ip, encode(sha256(convert_to(v_token::text, 'UTF8')), 'hex'));

  -- Preguntas de preselección
  for q in select * from public.form_questions where form_id = f.id and is_active order by position loop
    v_answer := nullif(left(btrim(coalesce(p -> 'answers' ->> q.id::text, '')), 1000), '');
    if q.required and v_answer is null then
      raise exception 'Responda la pregunta: %', q.label using errcode = '23514';
    end if;
    if v_answer is not null and q.kind = 'si_no' and v_answer not in ('si', 'no') then
      raise exception 'Respuesta no válida: %', q.label using errcode = '23514';
    end if;
    if v_answer is not null and q.kind = 'opcion' and not (v_answer = any (q.options)) then
      raise exception 'Respuesta no válida: %', q.label using errcode = '23514';
    end if;
    if v_answer is not null and q.kind = 'numero' and v_answer !~ '^\d{1,6}(\.\d{1,2})?$' then
      raise exception 'Indique un número: %', q.label using errcode = '23514';
    end if;
    v_meets := case
      when q.expected_answer is not null then v_answer = q.expected_answer
      when q.min_number is not null then v_answer is not null and v_answer::numeric >= q.min_number
      else null end;
    if v_meets is false then v_pre := false; end if;
    insert into public.submission_answers (submission_id, question_id, position, question_label, answer, meets)
    values (v_id, q.id, q.position, q.label, v_answer, v_meets);
  end loop;
  update public.intake_submissions set preselection_ok = v_pre where id = v_id;

  -- Incorporación automática si no hay coincidencias; si las hay, revisión humana
  select * into v_match from private.find_matches(v_data ->> 'national_id', v_data ->> 'email', v_data ->> 'phone', v_first, v_last);
  if v_match.candidate_id is null then
    perform private.incorporate_submission(v_id, null);
    update public.intake_submissions set status = 'incorporado' where id = v_id;
    v_status := 'incorporado';
  else
    update public.intake_submissions set match_candidate_id = v_match.candidate_id, match_reasons = v_match.reasons where id = v_id;
    v_status := 'revision';
  end if;
  return jsonb_build_object('submission_id', v_id, 'upload_token', v_token, 'status', v_status);
end;
$$;

-- Asocia el currículum ya cargado (solo con el token de un solo uso del envío)
create or replace function public.attach_submission_cv(p_key text, p_submission_id uuid, p_token uuid, p_mime text, p_size integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.intake_submissions%rowtype;
  v_path text;
  v_found boolean := true;
begin
  if not private.valid_public_form_key(p_key) then
    raise exception 'Formulario no disponible' using errcode = '42501';
  end if;
  select * into s from public.intake_submissions where id = p_submission_id for update;
  if not found or s.upload_token_hash is distinct from encode(sha256(convert_to(coalesce(p_token::text, ''), 'UTF8')), 'hex')
     or s.cv_path is not null or s.created_at < now() - interval '30 minutes' then
    raise exception 'No fue posible asociar el archivo' using errcode = '42501';
  end if;
  if p_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') or p_size not between 1 and 5242880 then
    raise exception 'Archivo no permitido' using errcode = '23514';
  end if;
  v_path := format('envios/%s/%s.%s', p_submission_id, p_token, case when p_mime = 'application/pdf' then 'pdf' else 'docx' end);
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into v_found using 'curriculums', v_path;
  end if;
  if not v_found then
    raise exception 'No se encontró el archivo cargado' using errcode = '23514';
  end if;
  update public.intake_submissions set cv_path = v_path, cv_mime = p_mime, cv_size = p_size, upload_token_hash = null where id = s.id;
  if s.candidate_id is not null then
    insert into public.candidate_documents (candidate_id, storage_path, file_name, mime, size_bytes, source, submission_id)
    values (s.candidate_id, v_path, 'curriculum' || case when p_mime = 'application/pdf' then '.pdf' else '.docx' end, p_mime, p_size, 'formulario', s.id)
    on conflict (storage_path) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Revisión humana de envíos con posibles duplicados
-- ---------------------------------------------------------------------
create or replace function public.review_submission(p_submission_id uuid, p_decision text, p_candidate_id uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.intake_submissions%rowtype;
  v_id uuid;
begin
  select * into s from public.intake_submissions where id = p_submission_id for update;
  if not found or not private.can_view_submission(s.vacancy_id) or not private.has_any_role('admin', 'coordinador', 'reclutador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if s.status <> 'revision' then
    raise exception 'El envío ya fue resuelto' using errcode = '23514';
  end if;
  if p_decision = 'vincular' then
    v_id := coalesce(p_candidate_id, s.match_candidate_id);
    if v_id is null or not exists (select 1 from public.candidates where id = v_id and status <> 'fusionado') then
      raise exception 'Seleccione el candidato existente' using errcode = '23514';
    end if;
    -- Vincular a una ficha distinta de la coincidencia exige poder editar esa ficha.
    if v_id is distinct from s.match_candidate_id and not private.can_edit_candidate(v_id) then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
    perform private.incorporate_submission(s.id, v_id);
    update public.intake_submissions set status = 'vinculado' where id = s.id;
  elsif p_decision = 'crear' then
    v_id := private.incorporate_submission(s.id, null);
    update public.intake_submissions set status = 'creado' where id = s.id;
  elsif p_decision = 'descartar' then
    update public.intake_submissions set status = 'descartado', data = null where id = s.id;
  else
    raise exception 'Decisión no válida' using errcode = '22023';
  end if;
  update public.intake_submissions set reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = s.id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Documentos del personal y descarga registrada
-- ---------------------------------------------------------------------
create or replace function public.register_candidate_document(p_candidate_id uuid, p_path text, p_file_name text, p_mime text, p_size integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_exists boolean := true;
begin
  if not private.can_edit_candidate(p_candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_path !~ ('^candidatos/' || p_candidate_id::text || '/[0-9a-f-]{36}\.(pdf|docx)$') then
    raise exception 'Ruta de archivo no válida' using errcode = '23514';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)' into v_exists using 'curriculums', p_path;
  end if;
  if not v_exists then
    raise exception 'No se encontró el archivo cargado' using errcode = '23514';
  end if;
  insert into public.candidate_documents (candidate_id, storage_path, file_name, mime, size_bytes, source, uploaded_by)
  values (p_candidate_id, p_path, left(regexp_replace(coalesce(nullif(btrim(p_file_name), ''), 'curriculum'), '[^0-9A-Za-zÁÉÍÓÚáéíóúÑñ ._-]', '', 'g'), 150),
          p_mime, p_size, 'personal', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Devuelve la ruta para generar un enlace firmado y REGISTRA la descarga.
create or replace function public.document_for_download(p_document_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  d public.candidate_documents%rowtype;
begin
  select * into d from public.candidate_documents where id = p_document_id;
  if not found or not private.can_view_candidate_private(d.candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, actor_id)
  values ('descargar', 'curriculum', d.candidate_id, 'Descarga de currículum', auth.uid());
  return d.storage_path;
end;
$$;

-- Lectura de un CV de un envío en revisión (antes de vincularlo a un candidato)
create or replace function public.submission_cv_for_download(p_submission_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.intake_submissions%rowtype;
begin
  select * into s from public.intake_submissions where id = p_submission_id;
  if not found or s.cv_path is null or not private.can_view_submission(s.vacancy_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, actor_id)
  values ('descargar', 'curriculum_envio', s.id, 'Revisión de envío', auth.uid());
  return s.cv_path;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Almacenamiento privado de currículums (Supabase Storage)
-- ---------------------------------------------------------------------
-- En «public» porque la política de almacenamiento para anon la invoca (anon no usa el esquema private).
-- Solo devuelve verdadero a quien ya conoce el envío y su token de un solo uso.
create or replace function public.can_upload_submission_cv(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if cardinality(parts) <> 3 or parts[1] <> 'envios' or parts[2] !~ '^[0-9a-f-]{36}$' or parts[3] !~ '^[0-9a-f-]{36}\.(pdf|docx)$' then
    return false;
  end if;
  return exists (select 1 from public.intake_submissions s
                 where s.id = parts[2]::uuid and s.cv_path is null and s.created_at > now() - interval '30 minutes'
                   and s.upload_token_hash = encode(sha256(convert_to(split_part(parts[3], '.', 1), 'UTF8')), 'hex'));
end;
$$;

create or replace function private.can_read_cv_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if cardinality(parts) <> 3 or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  if parts[1] = 'candidatos' then
    return private.can_view_candidate_private(parts[2]::uuid);
  elsif parts[1] = 'envios' then
    return exists (select 1 from public.intake_submissions s where s.id = parts[2]::uuid
                   and (private.can_view_submission(s.vacancy_id) or (s.candidate_id is not null and private.can_view_candidate_private(s.candidate_id))));
  end if;
  return false;
end;
$$;

create or replace function private.can_write_candidate_cv(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  return cardinality(parts) = 3 and parts[1] = 'candidatos' and parts[2] ~ '^[0-9a-f-]{36}$'
     and parts[3] ~ '^[0-9a-f-]{36}\.(pdf|docx)$' and private.can_edit_candidate(parts[2]::uuid);
end;
$$;

create or replace function private.can_delete_cv_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if cardinality(parts) <> 3 or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  -- Currículums de envíos descartados (quien puede ver el envío) …
  if parts[1] = 'envios' then
    return exists (select 1 from public.intake_submissions s
                   where s.id = parts[2]::uuid and s.status = 'descartado' and private.can_view_submission(s.vacancy_id));
  end if;
  -- … o cargas del personal que no llegaron a registrarse (limpieza tras un error).
  -- Los documentos registrados en la ficha se conservan.
  return parts[1] = 'candidatos' and private.can_edit_candidate(parts[2]::uuid)
     and not exists (select 1 from public.candidate_documents d where d.storage_path = p_name);
end;
$$;

revoke all on function public.can_upload_submission_cv(text) from public;
revoke all on function private.can_read_cv_object(text) from public;
revoke all on function private.can_write_candidate_cv(text) from public;
revoke all on function private.can_delete_cv_object(text) from public;
grant execute on function public.can_upload_submission_cv(text) to anon, authenticated;
grant execute on function private.can_read_cv_object(text) to authenticated;
grant execute on function private.can_write_candidate_cv(text) to authenticated;
grant execute on function private.can_delete_cv_object(text) to authenticated;

-- Bucket privado y políticas (solo donde existe Supabase Storage)
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage no disponible: se omiten bucket y políticas';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('curriculums', 'curriculums', false, 5242880,
          array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$create policy "curriculums: carga desde formularios" on storage.objects for insert to anon
    with check (bucket_id = 'curriculums' and public.can_upload_submission_cv(name))$p$;
  execute $p$create policy "curriculums: carga del personal" on storage.objects for insert to authenticated
    with check (bucket_id = 'curriculums' and private.can_write_candidate_cv(name))$p$;
  execute $p$create policy "curriculums: lectura autorizada" on storage.objects for select to authenticated
    using (bucket_id = 'curriculums' and private.can_read_cv_object(name))$p$;
  execute $p$create policy "curriculums: eliminar no registrados" on storage.objects for delete to authenticated
    using (bucket_id = 'curriculums' and private.can_delete_cv_object(name))$p$;
end;
$$;

-- ---------------------------------------------------------------------
-- 9) Permisos de las funciones
-- ---------------------------------------------------------------------
revoke all on function public.get_public_form(text) from public;
grant execute on function public.get_public_form(text) to anon, authenticated;
revoke all on function public.submit_public_form(text, text, jsonb, text) from public, authenticated;
grant execute on function public.submit_public_form(text, text, jsonb, text) to anon;
revoke all on function public.attach_submission_cv(text, uuid, uuid, text, integer) from public, authenticated;
grant execute on function public.attach_submission_cv(text, uuid, uuid, text, integer) to anon;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.review_submission(uuid, text, uuid, text)',
    'public.register_candidate_document(uuid, text, text, text, integer)',
    'public.document_for_download(uuid)',
    'public.submission_cv_for_download(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
