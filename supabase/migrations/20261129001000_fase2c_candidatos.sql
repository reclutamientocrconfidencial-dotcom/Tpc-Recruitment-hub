-- =====================================================================
-- TPC Recruitment Hub — Fase 2C: base madre de candidatos.
-- Migración 1000:
--   1. Datos sensibles en candidate_private (cédula, correo, teléfono,
--      pretensión salarial, notas confidenciales): sin acceso directo desde
--      la API; lectura solo mediante función que registra el acceso.
--      Invisibles para el rol consulta.
--   2. Consentimiento informado versionado (Ley 8968): textos con versión y
--      registro por candidato (canal, evidencia, revocación). Ningún
--      candidato existe sin un consentimiento vigente (restricción diferida).
--   3. Ficha: provincia, cantón (catálogo), distrito, localidad, fuente
--      (catálogo de fuentes), múltiples perfiles profesionales (catálogo de
--      puestos), estado y trazabilidad.
--   4. Duplicados: cédula normalizada (bloqueo); teléfono E.164, correo y
--      nombre (revisión humana); fusión y descarte de pares.
--   5. Importación masiva por lotes con validación previa, decisión humana
--      sobre duplicados, registro de acceso y reversión del lote.
--   6. Protección «sin datos reales»: hasta que un administrador la habilite
--      (tras la puerta S1), los correos de candidatos deben ser ficticios.
--
-- Compatible con el código anterior: las columnas sensibles de candidates
-- se conservan pero quedan siempre vacías (un trigger traslada cualquier
-- valor a candidate_private).
-- Verificación: supabase/verification/1000_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Normalización (funciones puras)
-- ---------------------------------------------------------------------
create or replace function private.norm_digits(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

-- Teléfono en formato E.164 (Costa Rica por omisión)
create or replace function private.norm_phone(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d is null then null
    when length(d) = 8 then '+506' || d
    when length(d) = 11 and left(d, 3) = '506' then '+' || d
    when ltrim(coalesce(p, '')) like '+%' and length(d) between 8 and 15 then '+' || d
    else null
  end
  from (select private.norm_digits(p) as d) x
$$;

create or replace function private.norm_email(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(lower(btrim(coalesce(p, ''))), '')
$$;

create or replace function private.norm_name(p_first text, p_last text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(lower(translate(btrim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')),
    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunaeiouunaeiouaeiou')), '\s+', ' ', 'g'), '')
$$;

revoke all on function private.norm_digits(text) from public;
revoke all on function private.norm_phone(text) from public;
revoke all on function private.norm_email(text) from public;
revoke all on function private.norm_name(text, text) from public;

-- ---------------------------------------------------------------------
-- 1) Catálogo territorial: cantones de Costa Rica (84)
-- ---------------------------------------------------------------------
create table public.cr_cantons (
  id        uuid primary key default gen_random_uuid(),
  province  public.cr_province not null,
  name      text not null,
  unique (province, name)
);
comment on table public.cr_cantons is 'Cantones de Costa Rica (división territorial administrativa).';
insert into public.cr_cantons (province, name)
select p::public.cr_province, c from (values
  ('San José', array['San José','Escazú','Desamparados','Puriscal','Tarrazú','Aserrí','Mora','Goicoechea','Santa Ana','Alajuelita','Vázquez de Coronado','Acosta','Tibás','Moravia','Montes de Oca','Turrubares','Dota','Curridabat','Pérez Zeledón','León Cortés Castro']),
  ('Alajuela', array['Alajuela','San Ramón','Grecia','San Mateo','Atenas','Naranjo','Palmares','Poás','Orotina','San Carlos','Zarcero','Sarchí','Upala','Los Chiles','Guatuso','Río Cuarto']),
  ('Cartago', array['Cartago','Paraíso','La Unión','Jiménez','Turrialba','Alvarado','Oreamuno','El Guarco']),
  ('Heredia', array['Heredia','Barva','Santo Domingo','Santa Bárbara','San Rafael','San Isidro','Belén','Flores','San Pablo','Sarapiquí']),
  ('Guanacaste', array['Liberia','Nicoya','Santa Cruz','Bagaces','Carrillo','Cañas','Abangares','Tilarán','Nandayure','La Cruz','Hojancha']),
  ('Puntarenas', array['Puntarenas','Esparza','Buenos Aires','Montes de Oro','Osa','Quepos','Golfito','Coto Brus','Parrita','Corredores','Garabito','Monteverde','Puerto Jiménez']),
  ('Limón', array['Limón','Pococí','Siquirres','Talamanca','Matina','Guácimo'])
) as t(p, cs), unnest(cs) as c;

alter table public.cr_cantons enable row level security;
alter table public.cr_cantons force row level security;
revoke all on public.cr_cantons from anon, authenticated;
grant select on public.cr_cantons to authenticated;
create policy "cr_cantons: leer (activos)" on public.cr_cantons for select to authenticated using ((select private.is_active_user()));

-- ---------------------------------------------------------------------
-- 2) Protección «sin datos reales» (puerta S1)
-- ---------------------------------------------------------------------
alter table public.security_settings
  add column real_data_enabled boolean not null default false;
comment on column public.security_settings.real_data_enabled is
  'Mientras sea false, solo se aceptan correos de candidatos ficticios (*.test / *.example).';
grant update (real_data_enabled) on public.security_settings to authenticated;

-- Solo se habilita con la verificación en dos pasos exigida (puerta S1) y por un admin con aal2 (política 0900).
create or replace function private.security_settings_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.real_data_enabled and not old.real_data_enabled and not new.mfa_required then
    raise exception 'Para habilitar datos reales, primero exija la verificación en dos pasos (puerta S1)' using errcode = '23514';
  end if;
  if new.real_data_enabled and not new.mfa_required then
    raise exception 'La verificación en dos pasos no puede dejar de exigirse mientras haya datos reales habilitados' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger security_settings_rules before update on public.security_settings
  for each row execute function private.security_settings_rules();
revoke all on function private.security_settings_rules() from public, authenticated;

create or replace function private.real_data_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.real_data_enabled from public.security_settings s limit 1), false)
$$;
revoke all on function private.real_data_enabled() from public, authenticated;

-- ---------------------------------------------------------------------
-- 3) Consentimiento informado versionado
-- ---------------------------------------------------------------------
create table public.consent_texts (
  id              uuid primary key default gen_random_uuid(),
  version         text not null unique check (char_length(version) between 1 and 30),
  title           text not null check (char_length(title) between 3 and 150),
  body            text not null check (char_length(body) between 20 and 20000),
  is_active       boolean not null default false,
  legal_approved  boolean not null default false,
  legal_note      text check (legal_note is null or char_length(legal_note) <= 500),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.consent_texts is 'Textos de consentimiento informado (Ley 8968), versionados e inmutables una vez usados.';
create unique index consent_texts_one_active_idx on public.consent_texts (is_active) where is_active;

insert into public.consent_texts (version, title, body, is_active, legal_approved, legal_note)
values ('2026-1-BORRADOR', 'Consentimiento para el tratamiento de datos personales (borrador)',
'TEXTO PROVISIONAL PENDIENTE DE REVISIÓN JURÍDICA (Ley N.° 8968). Autorizo a The People Outsourcing Company S.A. a '
|| 'recopilar, almacenar y tratar mis datos personales con la finalidad de evaluarme para procesos de reclutamiento '
|| 'propios y de sus clientes y de mantenerlos en su banco de talento. Puedo ejercer mis derechos de acceso, '
|| 'rectificación, cancelación y oposición en cualquier momento. Uso exclusivo con datos ficticios hasta su aprobación.',
true, false, 'Borrador técnico: debe reemplazarse por el texto aprobado por el asesor legal.');

create table public.candidate_consents (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references public.candidates (id) on delete cascade,
  consent_text_id  uuid not null references public.consent_texts (id) on delete restrict,
  channel          text not null check (channel in ('formulario_web', 'formulario_fisico', 'correo', 'telefono', 'presencial', 'importacion', 'otro')),
  evidence         text check (evidence is null or char_length(evidence) <= 300),
  given_at         timestamptz not null default now(),
  recorded_by      uuid references public.profiles (id) on delete set null,
  revoked_at       timestamptz,
  revoked_by       uuid references public.profiles (id) on delete set null,
  revoke_reason    text check (revoke_reason is null or char_length(revoke_reason) <= 300),
  created_at       timestamptz not null default now()
);
comment on table public.candidate_consents is 'Consentimientos otorgados por cada candidato (versión del texto, canal y evidencia).';
create index candidate_consents_candidate_idx on public.candidate_consents (candidate_id, given_at desc);

-- El texto de un consentimiento ya utilizado no se puede cambiar (solo activar/desactivar y aprobación jurídica).
create or replace function private.consent_texts_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.body is distinct from old.body or new.version is distinct from old.version or new.title is distinct from old.title)
     and exists (select 1 from public.candidate_consents c where c.consent_text_id = old.id) then
    raise exception 'El texto del consentimiento ya fue otorgado por candidatos: cree una versión nueva' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger consent_texts_rules before update on public.consent_texts
  for each row execute function private.consent_texts_rules();
create trigger consent_texts_set_created_by before insert on public.consent_texts
  for each row execute function private.set_created_by();
create trigger consent_texts_audit after insert or update or delete on public.consent_texts
  for each row execute function private.write_audit_log();
create trigger candidate_consents_audit after insert or update or delete on public.candidate_consents
  for each row execute function private.write_audit_log();
revoke all on function private.consent_texts_rules() from public, authenticated;

alter table public.consent_texts enable row level security;
alter table public.consent_texts force row level security;
revoke all on public.consent_texts from anon, authenticated;
grant select, insert, update (title, body, version, is_active, legal_approved, legal_note) on public.consent_texts to authenticated;
create policy "consent_texts: leer (activos)" on public.consent_texts for select to authenticated using ((select private.is_active_user()));
create policy "consent_texts: crear (admin)" on public.consent_texts for insert to authenticated with check ((select private.has_any_role('admin')));
create policy "consent_texts: editar (admin)" on public.consent_texts for update to authenticated
  using ((select private.has_any_role('admin'))) with check ((select private.has_any_role('admin')));

alter table public.candidate_consents enable row level security;
alter table public.candidate_consents force row level security;
revoke all on public.candidate_consents from anon, authenticated;
grant select on public.candidate_consents to authenticated;
-- Lectura: personal operativo (no consulta). Escritura solo mediante funciones.
create policy "candidate_consents: leer (admin, coord, reclutador)" on public.candidate_consents for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador', 'reclutador')));

-- ---------------------------------------------------------------------
-- 4) Ficha del candidato: columnas nuevas y datos sensibles separados
-- ---------------------------------------------------------------------
alter table public.candidates
  add column district          text check (district is null or char_length(district) <= 100),
  add column locality          text check (locality is null or char_length(locality) <= 150),
  add column intake_channel_id uuid references public.intake_channels (id) on delete restrict,
  add column source_detail     text check (source_detail is null or char_length(source_detail) <= 150),
  add column status            text not null default 'activo' check (status in ('activo', 'no_contactar', 'archivado', 'fusionado')),
  add column merged_into_id    uuid references public.candidates (id) on delete set null,
  add column full_name_norm    text,
  add column import_batch_id   uuid,
  add column updated_by        uuid references public.profiles (id) on delete set null;

create index candidates_full_name_trgm_idx on public.candidates using gin (full_name_norm extensions.gin_trgm_ops);
create index candidates_status_idx on public.candidates (status);
create index candidates_province_canton_idx on public.candidates (province, canton);
create index candidates_channel_idx on public.candidates (intake_channel_id);

-- created_by inmutable (0700), salvo cuando el perfil de origen se eliminó (ON DELETE SET NULL):
-- antes, eliminar un usuario que había creado registros fallaba por la llave foránea.
create or replace function private.keep_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null and old.created_by is not null
     and not exists (select 1 from public.profiles p where p.id = old.created_by) then
    new.created_at := old.created_at;
    return new;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Bitácora (0500): ignora también los campos calculados por el sistema (autor del cambio y nombre normalizado).
create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := '{}';
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select coalesce(array_agg(k order by k), '{}') into v_fields
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at', 'stage_changed_at', 'updated_by', 'full_name_norm')
      and v_new -> k is distinct from v_old -> k;
    if cardinality(v_fields) = 0 then
      return new;
    end if;
  end if;

  insert into public.audit_logs (table_name, record_id, action, changed_fields, actor_id)
  values (tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, tg_op, v_fields, auth.uid());
  return coalesce(new, old);
end;
$$;

-- Bitácora para tablas sin columna «id» propia: registra el candidato como referencia (sin valores).
create or replace function private.write_audit_log_candidate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[] := '{}';
  v_old jsonb; v_new jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    select coalesce(array_agg(k order by k), '{}') into v_fields
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at', 'updated_by') and v_new -> k is distinct from v_old -> k;
    if cardinality(v_fields) = 0 then return new; end if;
  end if;
  insert into public.audit_logs (table_name, record_id, action, changed_fields, actor_id)
  values (tg_table_name, case when tg_op = 'DELETE' then old.candidate_id else new.candidate_id end, tg_op, v_fields, auth.uid());
  return coalesce(new, old);
end;
$$;
revoke all on function private.write_audit_log_candidate() from public, authenticated;

create table public.candidate_private (
  candidate_id       uuid primary key references public.candidates (id) on delete cascade,
  national_id_type   text check (national_id_type is null or national_id_type in ('cedula', 'dimex', 'pasaporte', 'otro')),
  national_id        text check (national_id is null or char_length(national_id) <= 30),
  national_id_norm   text,
  email              text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_norm         text,
  phone              text check (phone is null or char_length(phone) <= 30),
  phone_e164         text,
  phone_alt          text check (phone_alt is null or char_length(phone_alt) <= 30),
  phone_alt_e164     text,
  expected_salary    numeric(14, 2) check (expected_salary is null or expected_salary >= 0),
  salary_currency    public.currency_code not null default 'CRC',
  confidential_notes text check (confidential_notes is null or char_length(confidential_notes) <= 4000),
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);
comment on table public.candidate_private is 'Datos sensibles del candidato. Sin acceso directo: solo funciones que validan el rol y registran la lectura.';
create unique index candidate_private_national_id_uq on public.candidate_private (national_id_norm) where national_id_norm is not null;
create index candidate_private_email_idx on public.candidate_private (email_norm);
create index candidate_private_phone_idx on public.candidate_private (phone_e164);
create index candidate_private_phone_alt_idx on public.candidate_private (phone_alt_e164);

alter table public.candidate_private enable row level security;
alter table public.candidate_private force row level security;
revoke all on public.candidate_private from anon, authenticated;
-- Sin políticas: ni siquiera el administrador lee la tabla directamente (todo pasa por funciones auditadas).

create or replace function private.candidate_private_normalize()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.national_id_norm := upper(regexp_replace(coalesce(new.national_id, ''), '[^0-9A-Za-z]', '', 'g'));
  if new.national_id_norm = '' then new.national_id_norm := null; end if;
  new.email_norm := private.norm_email(new.email);
  new.phone_e164 := private.norm_phone(new.phone);
  new.phone_alt_e164 := private.norm_phone(new.phone_alt);
  if new.email_norm is not null and not private.real_data_enabled() and new.email_norm !~ '\.(test|example)$' then
    raise exception 'Datos reales deshabilitados: use correos ficticios (*.test) hasta completar la puerta S1' using errcode = '23514';
  end if;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
create trigger candidate_private_normalize before insert or update on public.candidate_private
  for each row execute function private.candidate_private_normalize();
create trigger candidate_private_audit after insert or update or delete on public.candidate_private
  for each row execute function private.write_audit_log_candidate();
revoke all on function private.candidate_private_normalize() from public, authenticated;

-- Datos existentes → candidate_private (las columnas sensibles de candidates quedan vacías)
insert into public.candidate_private (candidate_id, national_id, email, phone, expected_salary, salary_currency, confidential_notes)
select c.id, c.national_id, c.email, c.phone, c.expected_salary, c.currency, c.notes
from public.candidates c
where c.national_id is not null or c.email is not null or c.phone is not null or c.expected_salary is not null or c.notes is not null;
update public.candidates set national_id = null, email = null, phone = null, expected_salary = null, notes = null
where national_id is not null or email is not null or phone is not null or expected_salary is not null or notes is not null;
update public.candidates set full_name_norm = private.norm_name(first_name, last_name);

-- Consentimientos previos (registros ficticios anteriores a 2C) → versión borrador
insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, given_at)
select c.id, (select id from public.consent_texts where is_active), 'otro', 'Registro anterior a la fase 2C', coalesce(c.consent_at, c.created_at)
from public.candidates c where c.consent_given;

-- Trigger de la ficha: nombre normalizado, autor del cambio y traslado de datos sensibles
create or replace function private.candidates_protect()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.full_name_norm := private.norm_name(new.first_name, new.last_name);
  if tg_op = 'UPDATE' then
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
    if new.national_id is not null or new.email is not null or new.phone is not null or new.expected_salary is not null or new.notes is not null then
      insert into public.candidate_private as cp (candidate_id, national_id, email, phone, expected_salary, salary_currency, confidential_notes)
      values (new.id, new.national_id, new.email, new.phone, new.expected_salary, new.currency, new.notes)
      on conflict (candidate_id) do update set
        national_id = coalesce(excluded.national_id, cp.national_id),
        email = coalesce(excluded.email, cp.email),
        phone = coalesce(excluded.phone, cp.phone),
        expected_salary = coalesce(excluded.expected_salary, cp.expected_salary),
        confidential_notes = coalesce(excluded.confidential_notes, cp.confidential_notes);
      new.national_id := null; new.email := null; new.phone := null; new.expected_salary := null; new.notes := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger candidates_protect before insert or update on public.candidates
  for each row execute function private.candidates_protect();

create or replace function private.candidates_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.national_id is not null or new.email is not null or new.phone is not null or new.expected_salary is not null or new.notes is not null then
    insert into public.candidate_private (candidate_id, national_id, email, phone, expected_salary, salary_currency, confidential_notes)
    values (new.id, new.national_id, new.email, new.phone, new.expected_salary, new.currency, new.notes);
    update public.candidates set national_id = null, email = null, phone = null, expected_salary = null, notes = null where id = new.id;
  end if;
  -- Cargas administrativas sin sesión (datos ficticios de prueba): consentimiento con la versión vigente.
  if auth.uid() is null and new.consent_given
     and not exists (select 1 from public.candidate_consents c where c.candidate_id = new.id) then
    insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, given_at)
    values (new.id, (select id from public.consent_texts where is_active), 'otro', 'Carga administrativa', coalesce(new.consent_at, now()));
  end if;
  return new;
end;
$$;
create trigger candidates_after_insert after insert on public.candidates
  for each row execute function private.candidates_after_insert();

-- Ningún candidato sin consentimiento vigente (se valida al confirmar la transacción)
create or replace function private.candidates_require_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.candidates c where c.id = new.id)
     and not exists (select 1 from public.candidate_consents k where k.candidate_id = new.id and k.revoked_at is null) then
    raise exception 'Todo candidato requiere un consentimiento informado vigente (Ley 8968)' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger candidates_require_consent after insert on public.candidates
  deferrable initially deferred
  for each row execute function private.candidates_require_consent();

-- Estado de consentimiento en la ficha (compatibilidad con consent_given / consent_at)
create or replace function private.candidate_consents_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_at timestamptz;
begin
  select bool_or(k.revoked_at is null), max(k.given_at) filter (where k.revoked_at is null)
    into v_active, v_at
  from public.candidate_consents k where k.candidate_id = new.candidate_id;
  update public.candidates c
     set consent_given = coalesce(v_active, false),
         consent_at = v_at,
         status = case when not coalesce(v_active, false) and c.status = 'activo' then 'no_contactar' else c.status end
   where c.id = new.candidate_id;
  return new;
end;
$$;
create trigger candidate_consents_sync after insert or update of revoked_at, candidate_id on public.candidate_consents
  for each row execute function private.candidate_consents_sync();

revoke all on function private.candidates_protect() from public, authenticated;
revoke all on function private.candidates_after_insert() from public, authenticated;
revoke all on function private.candidates_require_consent() from public, authenticated;
revoke all on function private.candidate_consents_sync() from public, authenticated;

-- Perfiles profesionales (varios por candidato, del catálogo de puestos)
create table public.candidate_profiles (
  candidate_id  uuid not null references public.candidates (id) on delete cascade,
  position_id   uuid not null references public.job_positions (id) on delete restrict,
  is_primary    boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (candidate_id, position_id)
);
create unique index candidate_profiles_one_primary_idx on public.candidate_profiles (candidate_id) where is_primary;
create index candidate_profiles_position_idx on public.candidate_profiles (position_id);
alter table public.candidate_profiles enable row level security;
alter table public.candidate_profiles force row level security;
revoke all on public.candidate_profiles from anon, authenticated;
grant select on public.candidate_profiles to authenticated;
create policy "candidate_profiles: leer (activos)" on public.candidate_profiles for select to authenticated using ((select private.is_active_user()));
create trigger candidate_profiles_audit after insert or update or delete on public.candidate_profiles
  for each row execute function private.write_audit_log_candidate();

-- ---------------------------------------------------------------------
-- 5) Autorización por candidato
-- ---------------------------------------------------------------------
-- ¿Puede ver los datos sensibles? Admin/coord: todos. Reclutador: propios o en sus vacantes.
create or replace function private.can_view_candidate_private(p_candidate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador')
      or (private.has_any_role('reclutador') and exists (
            select 1 from public.candidates c
            where c.id = p_candidate_id
              and (c.owner_id = auth.uid() or c.created_by = auth.uid()
                   or exists (select 1 from public.applications a
                              where a.candidate_id = c.id and private.is_assigned_to_vacancy(a.vacancy_id)))))
$$;
-- ¿Puede editar la ficha? Igual que la política de candidates (0400): admin/coord o reclutador responsable.
create or replace function private.can_edit_candidate(p_candidate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador')
      or (private.has_any_role('reclutador') and exists (
            select 1 from public.candidates c
            where c.id = p_candidate_id and (c.owner_id = auth.uid() or c.created_by = auth.uid())))
$$;
revoke all on function private.can_view_candidate_private(uuid) from public;
revoke all on function private.can_edit_candidate(uuid) from public;
grant execute on function private.can_view_candidate_private(uuid) to authenticated;
grant execute on function private.can_edit_candidate(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Lectura auditada de datos sensibles
-- ---------------------------------------------------------------------
create or replace function public.get_candidate_private(p_candidate_id uuid, p_reason text default null)
returns table (national_id_type text, national_id text, email text, phone text, phone_alt text,
               expected_salary numeric, salary_currency public.currency_code, confidential_notes text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_view_candidate_private(p_candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.access_logs (action, resource, record_id, reason, actor_id)
  values ('ver_dato_sensible', 'candidatos', p_candidate_id, coalesce(nullif(btrim(p_reason), ''), 'Consulta de la ficha'), auth.uid());
  return query
    select p.national_id_type, p.national_id, p.email, p.phone, p.phone_alt, p.expected_salary, p.salary_currency, p.confidential_notes
    from public.candidate_private p where p.candidate_id = p_candidate_id;
end;
$$;

-- Búsqueda por cédula, correo o teléfono (devuelve solo identificadores y nombres)
create or replace function public.search_candidates_by_contact(p_term text)
returns table (candidate_id uuid, full_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_term text := btrim(coalesce(p_term, ''));
  v_digits text := private.norm_digits(p_term);
begin
  if not private.has_any_role('admin', 'coordinador', 'reclutador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if char_length(v_term) < 4 then return; end if;
  insert into public.access_logs (action, resource, reason, actor_id)
  values ('ver_dato_sensible', 'candidatos_busqueda', 'Búsqueda por cédula, correo o teléfono', auth.uid());
  return query
    select c.id, c.first_name || ' ' || c.last_name
    from public.candidate_private p join public.candidates c on c.id = p.candidate_id
    where c.status <> 'fusionado'
      and (p.email_norm = private.norm_email(v_term)
           or p.national_id_norm = upper(regexp_replace(v_term, '[^0-9A-Za-z]', '', 'g'))
           or (v_digits is not null and length(v_digits) >= 8 and (p.phone_e164 = private.norm_phone(v_term) or p.phone_alt_e164 = private.norm_phone(v_term))))
    limit 50;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Duplicados (sin devolver datos sensibles)
-- ---------------------------------------------------------------------
create or replace function public.find_candidate_duplicates(
  p_national_id text, p_email text, p_phone text, p_first_name text, p_last_name text, p_exclude uuid default null)
returns table (candidate_id uuid, full_name text, reasons text[], blocking boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nid text := nullif(upper(regexp_replace(coalesce(p_national_id, ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_email text := private.norm_email(p_email);
  v_phone text := private.norm_phone(p_phone);
  v_name text := private.norm_name(p_first_name, p_last_name);
begin
  if not private.has_any_role('admin', 'coordinador', 'reclutador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select c.id, c.first_name || ' ' || c.last_name,
           array_remove(array[
             case when v_nid is not null and p.national_id_norm = v_nid then 'cédula' end,
             case when v_email is not null and p.email_norm = v_email then 'correo' end,
             case when v_phone is not null and (p.phone_e164 = v_phone or p.phone_alt_e164 = v_phone) then 'teléfono' end,
             case when v_name is not null and c.full_name_norm = v_name then 'nombre' end
           ], null),
           (v_nid is not null and p.national_id_norm = v_nid)
    from public.candidates c left join public.candidate_private p on p.candidate_id = c.id
    where c.status <> 'fusionado'
      and (p_exclude is null or c.id <> p_exclude)
      and ((v_nid is not null and p.national_id_norm = v_nid)
           or (v_email is not null and p.email_norm = v_email)
           or (v_phone is not null and (p.phone_e164 = v_phone or p.phone_alt_e164 = v_phone))
           or (v_name is not null and c.full_name_norm = v_name))
    limit 20;
end;
$$;

create table public.candidate_duplicate_dismissals (
  candidate_a  uuid not null references public.candidates (id) on delete cascade,
  candidate_b  uuid not null references public.candidates (id) on delete cascade,
  dismissed_by uuid references public.profiles (id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (candidate_a, candidate_b),
  check (candidate_a < candidate_b)
);
alter table public.candidate_duplicate_dismissals enable row level security;
alter table public.candidate_duplicate_dismissals force row level security;
revoke all on public.candidate_duplicate_dismissals from anon, authenticated;
grant select on public.candidate_duplicate_dismissals to authenticated;
create policy "candidate_duplicate_dismissals: leer (admin, coord)" on public.candidate_duplicate_dismissals for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));

-- Pares de posibles duplicados entre candidatos existentes (revisión humana)
create or replace function public.list_possible_duplicates(p_limit integer default 100)
returns table (candidate_a uuid, name_a text, candidate_b uuid, name_b text, reasons text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    with c as (
      select x.id, x.first_name || ' ' || x.last_name as nm, x.full_name_norm, p.email_norm, p.phone_e164
      from public.candidates x left join public.candidate_private p on p.candidate_id = x.id
      where x.status <> 'fusionado'
    )
    select a.id, a.nm, b.id, b.nm,
           array_remove(array[
             case when a.email_norm is not null and a.email_norm = b.email_norm then 'correo' end,
             case when a.phone_e164 is not null and a.phone_e164 = b.phone_e164 then 'teléfono' end,
             case when a.full_name_norm is not null and a.full_name_norm = b.full_name_norm then 'nombre' end
           ], null)
    from c a join c b on a.id < b.id
      and ((a.email_norm is not null and a.email_norm = b.email_norm)
        or (a.phone_e164 is not null and a.phone_e164 = b.phone_e164)
        or (a.full_name_norm is not null and a.full_name_norm = b.full_name_norm))
    where not exists (select 1 from public.candidate_duplicate_dismissals d where d.candidate_a = a.id and d.candidate_b = b.id)
    order by a.nm
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.dismiss_duplicate_pair(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.candidate_duplicate_dismissals (candidate_a, candidate_b, dismissed_by)
  values (least(p_a, p_b), greatest(p_a, p_b), auth.uid())
  on conflict do nothing;
end;
$$;

-- Fusión: conserva «p_keep»; mueve postulaciones, perfiles y consentimientos;
-- completa los datos sensibles vacíos; el otro registro queda «fusionado» y sin datos sensibles.
create or replace function public.merge_candidates(p_keep uuid, p_remove uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.candidate_private%rowtype;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_keep = p_remove then
    raise exception 'Seleccione dos candidatos distintos' using errcode = '23514';
  end if;
  if not exists (select 1 from public.candidates where id = p_keep and status <> 'fusionado')
     or not exists (select 1 from public.candidates where id = p_remove and status <> 'fusionado') then
    raise exception 'Uno de los candidatos no existe o ya fue fusionado' using errcode = '23514';
  end if;
  -- Postulaciones (si ya existe la misma vacante en el conservado, se mantiene la de él)
  update public.applications a set candidate_id = p_keep
   where a.candidate_id = p_remove
     and not exists (select 1 from public.applications k where k.candidate_id = p_keep and k.vacancy_id = a.vacancy_id);
  insert into public.candidate_profiles (candidate_id, position_id, is_primary, created_by)
  select p_keep, p.position_id, false, auth.uid() from public.candidate_profiles p where p.candidate_id = p_remove
  on conflict do nothing;
  update public.candidate_consents set candidate_id = p_keep where candidate_id = p_remove;
  -- Datos sensibles: se completan los vacíos del conservado
  select * into r from public.candidate_private where candidate_id = p_remove;
  if found then
    delete from public.candidate_private where candidate_id = p_remove;
    insert into public.candidate_private as cp (candidate_id, national_id_type, national_id, email, phone, phone_alt, expected_salary, salary_currency, confidential_notes)
    values (p_keep, r.national_id_type, r.national_id, r.email, r.phone, r.phone_alt, r.expected_salary, r.salary_currency, r.confidential_notes)
    on conflict (candidate_id) do update set
      national_id_type = coalesce(cp.national_id_type, excluded.national_id_type),
      national_id = coalesce(cp.national_id, excluded.national_id),
      email = coalesce(cp.email, excluded.email),
      phone = coalesce(cp.phone, excluded.phone),
      phone_alt = coalesce(cp.phone_alt, excluded.phone_alt),
      expected_salary = coalesce(cp.expected_salary, excluded.expected_salary),
      confidential_notes = case when cp.confidential_notes is null then excluded.confidential_notes
                                when excluded.confidential_notes is null then cp.confidential_notes
                                else cp.confidential_notes || E'\n---\n' || excluded.confidential_notes end;
  end if;
  update public.candidates set status = 'fusionado', merged_into_id = p_keep where id = p_remove;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Alta y edición de la ficha (atómica: ficha + datos sensibles + perfiles + consentimiento)
-- ---------------------------------------------------------------------
create or replace function public.save_candidate(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_positions uuid[];
  v_primary uuid := nullif(p ->> 'primary_position_id', '')::uuid;
  v_consent jsonb := p -> 'consent';
  v_text uuid;
begin
  if not private.has_any_role('admin', 'coordinador', 'reclutador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_positions from jsonb_array_elements_text(coalesce(p -> 'position_ids', '[]'::jsonb)) x;

  if v_id is null then
    if v_consent is null or nullif(v_consent ->> 'channel', '') is null then
      raise exception 'Todo candidato requiere un consentimiento informado vigente (Ley 8968)' using errcode = '23514';
    end if;
    insert into public.candidates (first_name, last_name, province, canton, district, locality, current_title, years_experience,
                                   english_level, intake_channel_id, source_detail, owner_id, created_by, currency)
    values (p ->> 'first_name', p ->> 'last_name', nullif(p ->> 'province', '')::public.cr_province, nullif(p ->> 'canton', ''),
            nullif(p ->> 'district', ''), nullif(p ->> 'locality', ''), nullif(p ->> 'current_title', ''),
            nullif(p ->> 'years_experience', '')::numeric, nullif(p ->> 'english_level', ''),
            nullif(p ->> 'intake_channel_id', '')::uuid, nullif(p ->> 'source_detail', ''),
            coalesce(nullif(p ->> 'owner_id', '')::uuid, auth.uid()), auth.uid(),
            coalesce(nullif(p ->> 'salary_currency', '')::public.currency_code, 'CRC'))
    returning id into v_id;
  else
    if not private.can_edit_candidate(v_id) then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
    update public.candidates set
      first_name = p ->> 'first_name', last_name = p ->> 'last_name',
      province = nullif(p ->> 'province', '')::public.cr_province, canton = nullif(p ->> 'canton', ''),
      district = nullif(p ->> 'district', ''), locality = nullif(p ->> 'locality', ''),
      current_title = nullif(p ->> 'current_title', ''), years_experience = nullif(p ->> 'years_experience', '')::numeric,
      english_level = nullif(p ->> 'english_level', ''), intake_channel_id = nullif(p ->> 'intake_channel_id', '')::uuid,
      source_detail = nullif(p ->> 'source_detail', ''),
      owner_id = case when private.has_any_role('admin', 'coordinador') then coalesce(nullif(p ->> 'owner_id', '')::uuid, owner_id) else owner_id end
    where id = v_id and status <> 'fusionado';
    if not found then raise exception 'El candidato no existe o fue fusionado' using errcode = '23503'; end if;
  end if;

  insert into public.candidate_private as cp (candidate_id, national_id_type, national_id, email, phone, phone_alt, expected_salary, salary_currency, confidential_notes)
  values (v_id, nullif(p ->> 'national_id_type', ''), nullif(p ->> 'national_id', ''), nullif(p ->> 'email', ''), nullif(p ->> 'phone', ''),
          nullif(p ->> 'phone_alt', ''), nullif(p ->> 'expected_salary', '')::numeric,
          coalesce(nullif(p ->> 'salary_currency', '')::public.currency_code, 'CRC'), nullif(p ->> 'confidential_notes', ''))
  on conflict (candidate_id) do update set
    national_id_type = excluded.national_id_type, national_id = excluded.national_id, email = excluded.email,
    phone = excluded.phone, phone_alt = excluded.phone_alt, expected_salary = excluded.expected_salary,
    salary_currency = excluded.salary_currency, confidential_notes = excluded.confidential_notes;

  -- Perfiles: se reemplazan por los indicados
  delete from public.candidate_profiles where candidate_id = v_id and not (position_id = any (v_positions));
  insert into public.candidate_profiles (candidate_id, position_id, is_primary, created_by)
  select v_id, x, false, auth.uid() from unnest(v_positions) x
  on conflict (candidate_id, position_id) do nothing;
  update public.candidate_profiles set is_primary = (position_id = coalesce(v_primary, v_positions[1])) where candidate_id = v_id;

  if v_consent is not null and nullif(v_consent ->> 'channel', '') is not null then
    v_text := coalesce(nullif(v_consent ->> 'consent_text_id', '')::uuid, (select id from public.consent_texts where is_active));
    if not exists (select 1 from public.consent_texts t where t.id = v_text and t.is_active) then
      raise exception 'Seleccione la versión vigente del consentimiento' using errcode = '23514';
    end if;
    if private.real_data_enabled() and not exists (select 1 from public.consent_texts t where t.id = v_text and t.legal_approved) then
      raise exception 'El consentimiento vigente no tiene aprobación jurídica' using errcode = '23514';
    end if;
    insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, given_at, recorded_by)
    values (v_id, v_text, v_consent ->> 'channel', nullif(v_consent ->> 'evidence', ''),
            coalesce(nullif(v_consent ->> 'given_at', '')::timestamptz, now()), auth.uid());
  end if;
  return v_id;
end;
$$;

create or replace function public.revoke_candidate_consent(p_consent_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_candidate uuid;
begin
  select candidate_id into v_candidate from public.candidate_consents where id = p_consent_id and revoked_at is null;
  if v_candidate is null then
    raise exception 'El consentimiento no existe o ya fue revocado' using errcode = '23503';
  end if;
  if not private.can_edit_candidate(v_candidate) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo de la revocación del consentimiento' using errcode = '23514';
  end if;
  update public.candidate_consents set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
  where id = p_consent_id;
end;
$$;

-- Nuevo consentimiento para un candidato existente (p. ej., tras una revocación o una versión nueva)
create or replace function public.add_candidate_consent(p_candidate_id uuid, p_channel text, p_evidence text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_text uuid := (select id from public.consent_texts where is_active);
begin
  if not private.can_edit_candidate(p_candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_text is null then
    raise exception 'No hay una versión vigente del consentimiento' using errcode = '23514';
  end if;
  if private.real_data_enabled() and not exists (select 1 from public.consent_texts t where t.id = v_text and t.legal_approved) then
    raise exception 'El consentimiento vigente no tiene aprobación jurídica' using errcode = '23514';
  end if;
  insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, recorded_by)
  values (p_candidate_id, v_text, p_channel, nullif(btrim(coalesce(p_evidence, '')), ''), auth.uid());
  update public.candidates set status = 'activo' where id = p_candidate_id and status = 'no_contactar';
end;
$$;

-- ---------------------------------------------------------------------
-- 9) Importación masiva por lotes
-- ---------------------------------------------------------------------
create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  file_name        text not null check (char_length(file_name) between 1 and 200),
  status           text not null default 'cargando' check (status in ('cargando', 'validado', 'importado', 'cancelado', 'revertido')),
  consent_text_id  uuid not null references public.consent_texts (id) on delete restrict,
  consent_channel  text not null check (consent_channel in ('formulario_web', 'formulario_fisico', 'correo', 'telefono', 'presencial', 'importacion', 'otro')),
  consent_evidence text not null check (char_length(consent_evidence) between 5 and 300),
  reason           text not null check (char_length(reason) between 5 and 300),
  row_count        integer not null default 0,
  created_count    integer not null default 0,
  updated_count    integer not null default 0,
  skipped_count    integer not null default 0,
  reverted_count   integer,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  committed_at     timestamptz,
  reverted_at      timestamptz
);
comment on table public.import_batches is 'Lotes de importación de candidatos (validación, decisión humana, importación y reversión).';
alter table public.candidates add constraint candidates_import_batch_fk foreign key (import_batch_id) references public.import_batches (id) on delete set null;

create table public.import_rows (
  batch_id            uuid not null references public.import_batches (id) on delete cascade,
  row_number          integer not null,
  data                jsonb,          -- datos de la fila; se borran al importar o cancelar
  full_name           text,           -- para el informe (sin datos de contacto)
  status              text not null check (status in ('valido', 'error', 'duplicado', 'posible_duplicado')),
  errors              text[] not null default '{}',
  match_candidate_id  uuid references public.candidates (id) on delete set null,
  match_reasons       text[] not null default '{}',
  decision            text check (decision is null or decision in ('crear', 'actualizar', 'omitir')),
  result_candidate_id uuid references public.candidates (id) on delete set null,
  primary key (batch_id, row_number)
);
comment on table public.import_rows is 'Filas de un lote. Los datos personales se eliminan al importar o cancelar.';

alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;
alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;
revoke all on public.import_batches, public.import_rows from anon, authenticated;
grant select on public.import_batches, public.import_rows to authenticated;
create policy "import_batches: leer (admin, coord)" on public.import_batches for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));
create policy "import_rows: leer (admin, coord)" on public.import_rows for select to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));
create trigger import_batches_audit after insert or update or delete on public.import_batches
  for each row execute function private.write_audit_log();

create or replace function public.import_batch_create(p_file_name text, p_consent_text_id uuid, p_channel text, p_evidence text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consent_texts t where t.id = p_consent_text_id and t.is_active) then
    raise exception 'Seleccione la versión vigente del consentimiento' using errcode = '23514';
  end if;
  insert into public.import_batches (file_name, consent_text_id, consent_channel, consent_evidence, reason, created_by)
  values (p_file_name, p_consent_text_id, p_channel, btrim(p_evidence), btrim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Agrega filas ya validadas en la aplicación (máx. 1.000 por llamada) y detecta duplicados.
create or replace function public.import_batch_add_rows(p_batch uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  d jsonb;
  v_errors text[];
  v_match record;
  v_status text;
  v_count integer := 0;
  v_nid text; v_email text;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.import_batches b where b.id = p_batch and b.status = 'cargando' and (b.created_by = auth.uid() or private.has_any_role('admin'))) then
    raise exception 'El lote no existe o ya no admite filas' using errcode = '23514';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Máximo 1.000 filas por envío' using errcode = '23514';
  end if;
  if (select count(*) from public.import_rows where batch_id = p_batch) + jsonb_array_length(p_rows) > 5000 then
    raise exception 'Un lote admite como máximo 5.000 filas' using errcode = '23514';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    d := r -> 'data';
    select coalesce(array_agg(e), '{}') into v_errors from jsonb_array_elements_text(coalesce(r -> 'errors', '[]'::jsonb)) e;
    v_nid := nullif(upper(regexp_replace(coalesce(d ->> 'national_id', ''), '[^0-9A-Za-z]', '', 'g')), '');
    v_email := private.norm_email(d ->> 'email');
    v_status := case when cardinality(v_errors) > 0 then 'error' else 'valido' end;

    -- Duplicados dentro del mismo archivo
    if v_status = 'valido' and exists (
      select 1 from public.import_rows x
      where x.batch_id = p_batch and x.data is not null and (
        (v_nid is not null and upper(regexp_replace(coalesce(x.data ->> 'national_id', ''), '[^0-9A-Za-z]', '', 'g')) = v_nid)
        or (v_email is not null and private.norm_email(x.data ->> 'email') = v_email))) then
      v_status := 'error';
      v_errors := array_append(v_errors, 'Duplicado dentro del archivo (misma cédula o correo que una fila anterior).');
    end if;

    select f.candidate_id, f.reasons, f.blocking into v_match
    from public.find_candidate_duplicates(d ->> 'national_id', d ->> 'email', d ->> 'phone', d ->> 'first_name', d ->> 'last_name') f
    order by f.blocking desc, cardinality(f.reasons) desc
    limit 1;

    if v_status = 'valido' and v_match.candidate_id is not null then
      v_status := case when v_match.blocking then 'duplicado' else 'posible_duplicado' end;
    end if;

    insert into public.import_rows (batch_id, row_number, data, full_name, status, errors, match_candidate_id, match_reasons, decision)
    values (p_batch, (r ->> 'row_number')::integer, d, btrim(coalesce(d ->> 'first_name', '') || ' ' || coalesce(d ->> 'last_name', '')),
            v_status, v_errors,
            case when v_status in ('duplicado', 'posible_duplicado') then v_match.candidate_id end,
            case when v_status in ('duplicado', 'posible_duplicado') then v_match.reasons else '{}'::text[] end,
            case v_status when 'valido' then 'crear' when 'error' then 'omitir' when 'duplicado' then 'omitir' else null end);
    v_count := v_count + 1;
    v_match := null;
  end loop;
  update public.import_batches set row_count = (select count(*) from public.import_rows where batch_id = p_batch) where id = p_batch;
  return v_count;
end;
$$;

create or replace function public.import_batch_finish(p_batch uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.import_batches set status = 'validado' where id = p_batch and status = 'cargando';
  if not found then raise exception 'El lote no existe o ya fue validado' using errcode = '23514'; end if;
end;
$$;

-- Decisión humana por fila (crear / actualizar el existente / omitir)
create or replace function public.import_set_decision(p_batch uuid, p_row integer, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.import_rows%rowtype;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_row from public.import_rows r
  where r.batch_id = p_batch and r.row_number = p_row
    and exists (select 1 from public.import_batches b where b.id = p_batch and b.status = 'validado');
  if not found then raise exception 'La fila no existe o el lote ya no admite cambios' using errcode = '23514'; end if;
  if v_row.status = 'error' and p_decision <> 'omitir' then
    raise exception 'Las filas con errores no se importan: corríjalas en el archivo' using errcode = '23514';
  end if;
  if p_decision = 'actualizar' and v_row.match_candidate_id is null then
    raise exception 'Solo se puede actualizar un candidato existente detectado como duplicado' using errcode = '23514';
  end if;
  if p_decision = 'crear' and v_row.status = 'duplicado' then
    raise exception 'La cédula ya existe: actualice el candidato existente u omita la fila' using errcode = '23514';
  end if;
  update public.import_rows set decision = p_decision where batch_id = p_batch and row_number = p_row;
end;
$$;

create or replace function public.import_batch_commit(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  d jsonb;
  v_id uuid;
  v_pos uuid;
  v_created integer := 0; v_updated integer := 0; v_skipped integer := 0;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into b from public.import_batches where id = p_batch for update;
  if not found or b.status <> 'validado' then
    raise exception 'El lote no existe o no está listo para importar' using errcode = '23514';
  end if;
  if exists (select 1 from public.import_rows where batch_id = p_batch and decision is null) then
    raise exception 'Revise todos los posibles duplicados antes de importar' using errcode = '23514';
  end if;
  if not exists (select 1 from public.consent_texts t where t.id = b.consent_text_id and t.is_active) then
    raise exception 'La versión del consentimiento del lote ya no está vigente' using errcode = '23514';
  end if;
  if private.real_data_enabled() and not exists (select 1 from public.consent_texts t where t.id = b.consent_text_id and t.legal_approved) then
    raise exception 'El consentimiento vigente no tiene aprobación jurídica' using errcode = '23514';
  end if;

  for r in select * from public.import_rows where batch_id = p_batch order by row_number loop
    d := r.data;
    if r.decision = 'omitir' or d is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_pos := null;
    if nullif(d ->> 'position', '') is not null then
      select id into v_pos from public.job_positions where lower(name) = lower(btrim(d ->> 'position')) and is_active limit 1;
      if v_pos is null and not exists (select 1 from public.job_positions where lower(name) = lower(btrim(d ->> 'position'))) then
        insert into public.job_positions (name) values (btrim(d ->> 'position')) returning id into v_pos;
      end if;
    end if;

    if r.decision = 'crear' then
      insert into public.candidates (first_name, last_name, province, canton, district, locality, current_title,
                                     intake_channel_id, source_detail, owner_id, created_by, import_batch_id)
      values (d ->> 'first_name', d ->> 'last_name', nullif(d ->> 'province', '')::public.cr_province, nullif(d ->> 'canton', ''),
              nullif(d ->> 'district', ''), nullif(d ->> 'locality', ''), nullif(d ->> 'position', ''),
              nullif(d ->> 'intake_channel_id', '')::uuid, nullif(d ->> 'source_detail', ''), auth.uid(), auth.uid(), p_batch)
      returning id into v_id;
      insert into public.candidate_private (candidate_id, national_id_type, national_id, email, phone)
      values (v_id, nullif(d ->> 'national_id_type', ''), nullif(d ->> 'national_id', ''), nullif(d ->> 'email', ''), nullif(d ->> 'phone', ''));
      v_created := v_created + 1;
    else
      -- Actualizar: solo completa datos vacíos del expediente existente (nunca sobrescribe)
      v_id := r.match_candidate_id;
      update public.candidates c set
        province = coalesce(c.province, nullif(d ->> 'province', '')::public.cr_province),
        canton = coalesce(c.canton, nullif(d ->> 'canton', '')),
        district = coalesce(c.district, nullif(d ->> 'district', '')),
        locality = coalesce(c.locality, nullif(d ->> 'locality', '')),
        current_title = coalesce(c.current_title, nullif(d ->> 'position', '')),
        intake_channel_id = coalesce(c.intake_channel_id, nullif(d ->> 'intake_channel_id', '')::uuid),
        status = case when c.status = 'fusionado' then c.status else c.status end
      where c.id = v_id;
      insert into public.candidate_private as cp (candidate_id, national_id, email, phone)
      values (v_id, nullif(d ->> 'national_id', ''), nullif(d ->> 'email', ''), nullif(d ->> 'phone', ''))
      on conflict (candidate_id) do update set
        national_id = coalesce(cp.national_id, excluded.national_id),
        email = coalesce(cp.email, excluded.email),
        phone = coalesce(cp.phone, excluded.phone);
      v_updated := v_updated + 1;
    end if;

    if v_pos is not null then
      insert into public.candidate_profiles (candidate_id, position_id, is_primary, created_by)
      values (v_id, v_pos, not exists (select 1 from public.candidate_profiles where candidate_id = v_id), auth.uid())
      on conflict do nothing;
    end if;
    insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence, recorded_by)
    values (v_id, b.consent_text_id, b.consent_channel, b.consent_evidence, auth.uid());
    update public.import_rows set result_candidate_id = v_id where batch_id = p_batch and row_number = r.row_number;
  end loop;

  update public.import_rows set data = null where batch_id = p_batch;
  update public.import_batches set status = 'importado', committed_at = now(),
         created_count = v_created, updated_count = v_updated, skipped_count = v_skipped
  where id = p_batch;
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values ('importar', 'candidatos', p_batch, b.reason, v_created + v_updated, auth.uid());
  return jsonb_build_object('creados', v_created, 'actualizados', v_updated, 'omitidos', v_skipped);
end;
$$;

create or replace function public.import_batch_cancel(p_batch uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.import_batches set status = 'cancelado' where id = p_batch and status in ('cargando', 'validado');
  if not found then raise exception 'El lote no existe o ya fue procesado' using errcode = '23514'; end if;
  update public.import_rows set data = null where batch_id = p_batch;
end;
$$;

-- Reversión (solo admin): elimina los candidatos creados por el lote que no tengan postulaciones.
create or replace function public.import_batch_revert(p_batch uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not private.has_any_role('admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indique el motivo de la reversión del lote' using errcode = '23514';
  end if;
  if not exists (select 1 from public.import_batches where id = p_batch and status = 'importado') then
    raise exception 'Solo se revierten lotes importados' using errcode = '23514';
  end if;
  delete from public.candidates c
  where c.import_batch_id = p_batch
    and not exists (select 1 from public.applications a where a.candidate_id = c.id);
  get diagnostics v_count = row_count;
  update public.import_batches set status = 'revertido', reverted_at = now(), reverted_count = v_count where id = p_batch;
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values ('importar', 'candidatos_reversion', p_batch, btrim(p_reason), v_count, auth.uid());
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 10) Permisos de las funciones
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_candidate_private(uuid, text)',
    'public.search_candidates_by_contact(text)',
    'public.find_candidate_duplicates(text, text, text, text, text, uuid)',
    'public.list_possible_duplicates(integer)',
    'public.dismiss_duplicate_pair(uuid, uuid)',
    'public.merge_candidates(uuid, uuid)',
    'public.save_candidate(uuid, jsonb)',
    'public.revoke_candidate_consent(uuid, text)',
    'public.add_candidate_consent(uuid, text, text)',
    'public.import_batch_create(text, uuid, text, text, text)',
    'public.import_batch_add_rows(uuid, jsonb)',
    'public.import_batch_finish(uuid)',
    'public.import_set_decision(uuid, integer, text)',
    'public.import_batch_commit(uuid)',
    'public.import_batch_cancel(uuid)',
    'public.import_batch_revert(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
