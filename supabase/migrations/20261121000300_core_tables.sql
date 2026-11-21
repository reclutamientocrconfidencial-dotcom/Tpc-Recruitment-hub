-- =====================================================================
-- Migración 0300: entidades principales del ATS
-- clientes → requisiciones → vacantes → postulaciones ← candidatos
-- =====================================================================

-- ---------------------------- CLIENTES -------------------------------
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 200),
  legal_id        text unique,               -- cédula jurídica
  industry        text,
  status          public.client_status not null default 'prospecto',
  contact_name    text,
  contact_email   text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone   text,
  province        public.cr_province,
  address         text,
  notes           text,
  account_manager_id uuid references public.profiles (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.clients is 'Empresas clientes para las que TPC recluta personal.';
create index clients_status_idx on public.clients (status);
create index clients_name_idx on public.clients (lower(name));

-- -------------------------- REQUISICIONES ----------------------------
create sequence public.requisition_code_seq;

create table public.requisitions (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique
                          default ('REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.requisition_code_seq')::text, 5, '0')),
  client_id             uuid not null references public.clients (id) on delete restrict,
  title                 text not null check (char_length(title) between 2 and 200),
  department            text,
  positions_count       integer not null default 1 check (positions_count between 1 and 500),
  priority              public.priority_level not null default 'media',
  status                public.requisition_status not null default 'borrador',
  requested_by_name     text,
  salary_min            numeric(14, 2) check (salary_min is null or salary_min >= 0),
  salary_max            numeric(14, 2) check (salary_max is null or salary_max >= 0),
  currency              public.currency_code not null default 'CRC',
  target_date           date,
  justification         text,
  assigned_recruiter_id uuid references public.profiles (id) on delete set null,
  approved_by           uuid references public.profiles (id) on delete set null,
  approved_at           timestamptz,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint requisitions_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
comment on table public.requisitions is 'Solicitud formal de personal emitida por un cliente.';
create index requisitions_client_idx on public.requisitions (client_id);
create index requisitions_status_idx on public.requisitions (status);
create index requisitions_recruiter_idx on public.requisitions (assigned_recruiter_id);

-- ----------------------------- VACANTES ------------------------------
create sequence public.vacancy_code_seq;

create table public.vacancies (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique
                     default ('VAC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.vacancy_code_seq')::text, 5, '0')),
  requisition_id   uuid not null references public.requisitions (id) on delete restrict,
  title            text not null check (char_length(title) between 2 and 200),
  description      text,
  requirements     text,
  province         public.cr_province,
  location_detail  text,
  modality         public.work_modality not null default 'presencial',
  employment_type  public.employment_type not null default 'tiempo_completo',
  status           public.vacancy_status not null default 'borrador',
  openings         integer not null default 1 check (openings between 1 and 500),
  salary_min       numeric(14, 2) check (salary_min is null or salary_min >= 0),
  salary_max       numeric(14, 2) check (salary_max is null or salary_max >= 0),
  currency         public.currency_code not null default 'CRC',
  published_at     timestamptz,
  closes_at        date,
  recruiter_id     uuid references public.profiles (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint vacancies_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
comment on table public.vacancies is 'Puesto publicado a partir de una requisición.';
create index vacancies_requisition_idx on public.vacancies (requisition_id);
create index vacancies_status_idx on public.vacancies (status);
create index vacancies_recruiter_idx on public.vacancies (recruiter_id);

-- ---------------------------- CANDIDATOS -----------------------------
create table public.candidates (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text not null check (char_length(first_name) between 1 and 100),
  last_name          text not null check (char_length(last_name) between 1 and 150),
  national_id        text unique,             -- cédula / DIMEX / pasaporte
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text,
  province           public.cr_province,
  canton             text,
  current_title      text,
  years_experience   numeric(4, 1) check (years_experience is null or years_experience between 0 and 70),
  expected_salary    numeric(14, 2) check (expected_salary is null or expected_salary >= 0),
  currency           public.currency_code not null default 'CRC',
  english_level      text check (english_level is null or english_level in ('ninguno','A1','A2','B1','B2','C1','C2','nativo')),
  source             text,                    -- referido, LinkedIn, portal, etc.
  tags               text[] not null default '{}',
  -- Ley N.° 8968 (Protección de la Persona frente al tratamiento de sus datos personales)
  consent_given      boolean not null default false,
  consent_at         timestamptz,
  notes              text,
  owner_id           uuid references public.profiles (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint candidates_consent_timestamp check (not consent_given or consent_at is not null)
);
comment on table public.candidates is 'Banco de talento. Datos personales sujetos a la Ley 8968 de Costa Rica.';
create index candidates_name_idx on public.candidates (lower(last_name), lower(first_name));
create index candidates_email_idx on public.candidates (lower(email));
create index candidates_owner_idx on public.candidates (owner_id);

-- --------------------------- POSTULACIONES ---------------------------
create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  vacancy_id     uuid not null references public.vacancies (id) on delete restrict,
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  stage          public.application_stage not null default 'nuevo',
  rating         smallint check (rating is null or rating between 1 and 5),
  notes          text,
  rejection_reason text,
  recruiter_id   uuid references public.profiles (id) on delete set null,
  applied_at     timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint applications_unique_candidate_vacancy unique (vacancy_id, candidate_id)
);
comment on table public.applications is 'Relación candidato–vacante y su avance en el proceso.';
create index applications_vacancy_idx on public.applications (vacancy_id);
create index applications_candidate_idx on public.applications (candidate_id);
create index applications_stage_idx on public.applications (stage);
create index applications_recruiter_idx on public.applications (recruiter_id);

create or replace function private.touch_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger applications_stage_changed
  before update on public.applications
  for each row execute function private.touch_stage_changed_at();

-- ------------------------ TRIGGERS COMUNES ---------------------------
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'requisitions', 'vacancies', 'candidates', 'applications'] loop
    execute format(
      'create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format(
      'create trigger %1$s_set_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
end;
$$;

-- -------------------- FUNCIONES DE ASIGNACIÓN ------------------------
-- ¿El usuario autenticado está asignado a la requisición?
create or replace function private.is_assigned_to_requisition(p_requisition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.requisitions r
    where r.id = p_requisition_id
      and (r.assigned_recruiter_id = auth.uid() or r.created_by = auth.uid())
  ) or exists (
    select 1 from public.vacancies v
    where v.requisition_id = p_requisition_id and v.recruiter_id = auth.uid()
  )
$$;

-- ¿El usuario autenticado está asignado a la vacante (directamente o vía requisición)?
create or replace function private.is_assigned_to_vacancy(p_vacancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vacancies v
    join public.requisitions r on r.id = v.requisition_id
    where v.id = p_vacancy_id
      and (v.recruiter_id = auth.uid() or r.assigned_recruiter_id = auth.uid())
  )
$$;

revoke all on function private.is_assigned_to_requisition(uuid) from public;
revoke all on function private.is_assigned_to_vacancy(uuid) from public;
grant execute on function private.is_assigned_to_requisition(uuid) to authenticated, service_role;
grant execute on function private.is_assigned_to_vacancy(uuid) to authenticated, service_role;
