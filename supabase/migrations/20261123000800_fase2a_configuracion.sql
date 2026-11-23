-- =====================================================================
-- TPC Recruitment Hub — Fase 2A
-- Migración 0800: búsqueda, catálogo de fuentes de recepción, plantillas de
-- proceso (etapas) y plantillas de requisitos por cliente y posición.
--
-- Solo AGREGA objetos: no modifica ni elimina datos existentes.
-- Verificación: supabase/verification/0800_verificar.sql
-- Reversión:    docs/OPERACION.md §5 (sección "Reversión de la migración 0800")
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Búsqueda rápida por nombre (pg_trgm está incluido en Supabase)
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create index if not exists clients_name_trgm_idx
  on public.clients using gin (name extensions.gin_trgm_ops);
create index if not exists clients_legal_id_trgm_idx
  on public.clients using gin (legal_id extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2) Tipos enumerados nuevos
-- ---------------------------------------------------------------------
create type public.intake_channel_category as enum (
  'whatsapp', 'correo', 'redes_sociales', 'plataforma_empleo',
  'feria_empleo', 'formulario', 'referencia', 'otro'
);

-- Categoría FIJA de cada etapa configurable: métricas, informes y seguridad
-- funcionan igual con cualquier configuración de etapas.
create type public.stage_category as enum ('nuevo', 'en_proceso', 'oferta', 'contratado', 'descartado');

create type public.stage_type as enum ('general', 'entrevista', 'prueba', 'verificacion', 'oferta');

create type public.requirement_type as enum ('obligatorio', 'deseable');

create type public.requirement_category as enum (
  'formacion', 'experiencia', 'idioma', 'certificacion', 'habilidad', 'disponibilidad', 'otro'
);

-- ---------------------------------------------------------------------
-- 3) Catálogo de fuentes de recepción
-- ---------------------------------------------------------------------
create table public.intake_channels (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name            text not null check (char_length(name) between 2 and 80),
  category        public.intake_channel_category not null,
  detail_label    text,          -- p. ej. "Nombre de la feria", "Persona que refiere"
  is_active       boolean not null default true,
  sort_order      integer not null default 100,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.intake_channels is 'Catálogo de canales por los que se reciben candidatos.';

insert into public.intake_channels (code, name, category, detail_label, sort_order) values
  ('whatsapp',          'WhatsApp',                     'whatsapp',          null,                          10),
  ('correo',            'Correo electrónico',           'correo',            null,                          20),
  ('linkedin',          'LinkedIn',                     'redes_sociales',    null,                          30),
  ('facebook',          'Facebook',                     'redes_sociales',    null,                          31),
  ('instagram',         'Instagram',                    'redes_sociales',    null,                          32),
  ('tiktok',            'TikTok',                       'redes_sociales',    null,                          33),
  ('red_social_otra',   'Otra red social',              'redes_sociales',    'Nombre de la red social',     39),
  ('plataforma_empleo', 'Plataforma de empleo',         'plataforma_empleo', 'Nombre de la plataforma',     40),
  ('feria_empleo',      'Feria de empleo',              'feria_empleo',      'Nombre y fecha de la feria',  50),
  ('formulario_web',    'Formulario web',               'formulario',        null,                          60),
  ('referencia',        'Referencia',                   'referencia',        'Persona que refiere',         70),
  ('otro',              'Otro',                         'otro',              'Detalle',                     99);

-- ---------------------------------------------------------------------
-- 4) Plantillas de proceso (etapas configurables por cliente)
-- ---------------------------------------------------------------------
create table public.pipeline_templates (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients (id) on delete cascade,  -- NULL = plantilla global de TPC
  name         text not null check (char_length(name) between 2 and 120),
  description  text,
  is_default   boolean not null default false,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.pipeline_templates is 'Plantillas de etapas del proceso. client_id NULL = global.';

-- Una sola plantilla predeterminada por cliente (y una global)
create unique index pipeline_templates_one_default_idx
  on public.pipeline_templates (coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;
create index pipeline_templates_client_idx on public.pipeline_templates (client_id);

create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.pipeline_templates (id) on delete cascade,
  position     smallint not null check (position between 1 and 50),
  name         text not null check (char_length(name) between 2 and 60),
  category     public.stage_category not null,
  stage_type   public.stage_type not null default 'general',
  target_days  smallint check (target_days is null or target_days between 0 and 365),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pipeline_stages_unique_position unique (template_id, position) deferrable initially deferred
);
comment on table public.pipeline_stages is 'Etapas ordenadas de una plantilla de proceso.';
create index pipeline_stages_template_idx on public.pipeline_stages (template_id);

-- Plantilla global predeterminada
with t as (
  insert into public.pipeline_templates (name, description, is_default)
  values ('Proceso estándar TPC', 'Plantilla global utilizada cuando el cliente no tiene una propia.', true)
  returning id
)
insert into public.pipeline_stages (template_id, position, name, category, stage_type, target_days)
select t.id, s.position, s.name, s.category::public.stage_category, s.stage_type::public.stage_type, s.target_days
from t, (values
  (1, 'Nuevo',           'nuevo',      'general',      2),
  (2, 'Preselección',    'en_proceso', 'general',      3),
  (3, 'Entrevista',      'en_proceso', 'entrevista',   5),
  (4, 'Prueba técnica',  'en_proceso', 'prueba',       5),
  (5, 'Verificación',    'en_proceso', 'verificacion', 3),
  (6, 'Oferta',          'oferta',     'oferta',       3),
  (7, 'Contratado',      'contratado', 'general',      null),
  (8, 'Descartado',      'descartado', 'general',      null)
) as s(position, name, category, stage_type, target_days);

-- ---------------------------------------------------------------------
-- 5) Plantillas de requisitos por cliente y/o posición
-- ---------------------------------------------------------------------
create table public.requirement_templates (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients (id) on delete cascade,  -- NULL = global
  position_title  text check (position_title is null or char_length(position_title) between 2 and 120),
  requirement     text not null check (char_length(requirement) between 2 and 300),
  requirement_type public.requirement_type not null default 'obligatorio',
  category        public.requirement_category not null default 'otro',
  expected_level  text check (expected_level is null or char_length(expected_level) <= 120),
  weight          smallint not null default 3 check (weight between 1 and 5),
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.requirement_templates is
  'Requisitos reutilizables por cliente y/o posición. Base para el futuro lector de CV / IA.';
create index requirement_templates_client_idx on public.requirement_templates (client_id, position_title);

-- ---------------------------------------------------------------------
-- 6) Triggers comunes (updated_at, created_by forzado e inmutable, bitácora)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['intake_channels', 'pipeline_templates', 'pipeline_stages', 'requirement_templates'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_set_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
    execute format('create trigger %1$s_keep_created_by before update on public.%1$I for each row execute function private.keep_created_by()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Permisos y RLS
--   Lectura: usuarios internos activos.
--   Fuentes: solo admin las administra (sin borrado: se desactivan).
--   Plantillas de proceso y requisitos: admin y coordinador.
-- ---------------------------------------------------------------------
revoke all on public.intake_channels, public.pipeline_templates, public.pipeline_stages,
  public.requirement_templates from anon;
revoke all on public.intake_channels, public.pipeline_templates, public.pipeline_stages,
  public.requirement_templates from authenticated;
grant select, insert, update on public.intake_channels to authenticated;
grant select, insert, update, delete on public.pipeline_templates, public.pipeline_stages,
  public.requirement_templates to authenticated;

alter table public.intake_channels        enable row level security;
alter table public.pipeline_templates     enable row level security;
alter table public.pipeline_stages        enable row level security;
alter table public.requirement_templates  enable row level security;
alter table public.intake_channels        force row level security;
alter table public.pipeline_templates     force row level security;
alter table public.pipeline_stages        force row level security;
alter table public.requirement_templates  force row level security;

create policy "intake_channels: leer (activos)"
  on public.intake_channels for select to authenticated
  using ((select private.is_active_user()));
create policy "intake_channels: crear (admin)"
  on public.intake_channels for insert to authenticated
  with check ((select private.has_any_role('admin')));
create policy "intake_channels: editar (admin)"
  on public.intake_channels for update to authenticated
  using ((select private.has_any_role('admin')))
  with check ((select private.has_any_role('admin')));

create policy "pipeline_templates: leer (activos)"
  on public.pipeline_templates for select to authenticated
  using ((select private.is_active_user()));
create policy "pipeline_templates: crear (admin, coord)"
  on public.pipeline_templates for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "pipeline_templates: editar (admin, coord)"
  on public.pipeline_templates for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador')))
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "pipeline_templates: borrar (admin, coord)"
  on public.pipeline_templates for delete to authenticated
  using ((select private.has_any_role('admin', 'coordinador')) and not is_default);

create policy "pipeline_stages: leer (activos)"
  on public.pipeline_stages for select to authenticated
  using ((select private.is_active_user()));
create policy "pipeline_stages: crear (admin, coord)"
  on public.pipeline_stages for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "pipeline_stages: editar (admin, coord)"
  on public.pipeline_stages for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador')))
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "pipeline_stages: borrar (admin, coord)"
  on public.pipeline_stages for delete to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));

create policy "requirement_templates: leer (activos)"
  on public.requirement_templates for select to authenticated
  using ((select private.is_active_user()));
create policy "requirement_templates: crear (admin, coord)"
  on public.requirement_templates for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "requirement_templates: editar (admin, coord)"
  on public.requirement_templates for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador')))
  with check ((select private.has_any_role('admin', 'coordinador')));
create policy "requirement_templates: borrar (admin, coord)"
  on public.requirement_templates for delete to authenticated
  using ((select private.has_any_role('admin', 'coordinador')));

-- ---------------------------------------------------------------------
-- 8) Guardado atómico de las etapas de una plantilla
--    SECURITY INVOKER: respeta RLS del usuario que la ejecuta.
--    Reemplaza todas las etapas en una sola transacción y valida que haya
--    al menos una etapa 'nuevo', una 'contratado' y una 'descartado'.
-- ---------------------------------------------------------------------
create or replace function public.save_pipeline_stages(p_template_id uuid, p_stages jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_stages) <> 'array' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_stages);
  if v_count < 3 or v_count > 50 then
    raise exception 'El proceso debe tener entre 3 y 50 etapas' using errcode = '23514';
  end if;

  if not exists (select 1 from jsonb_array_elements(p_stages) e where e ->> 'category' = 'nuevo')
     or not exists (select 1 from jsonb_array_elements(p_stages) e where e ->> 'category' = 'contratado')
     or not exists (select 1 from jsonb_array_elements(p_stages) e where e ->> 'category' = 'descartado') then
    raise exception 'El proceso debe incluir etapas de categoría nuevo, contratado y descartado'
      using errcode = '23514';
  end if;

  delete from public.pipeline_stages where template_id = p_template_id;

  insert into public.pipeline_stages (template_id, position, name, category, stage_type, target_days)
  select p_template_id,
         e.ord::smallint,
         trim(e.val ->> 'name'),
         (e.val ->> 'category')::public.stage_category,
         coalesce(nullif(e.val ->> 'stage_type', ''), 'general')::public.stage_type,
         nullif(e.val ->> 'target_days', '')::smallint
  from jsonb_array_elements(p_stages) with ordinality as e(val, ord);

  update public.pipeline_templates set updated_at = now() where id = p_template_id;
end;
$$;

revoke all on function public.save_pipeline_stages(uuid, jsonb) from public, anon;
grant execute on function public.save_pipeline_stages(uuid, jsonb) to authenticated;
