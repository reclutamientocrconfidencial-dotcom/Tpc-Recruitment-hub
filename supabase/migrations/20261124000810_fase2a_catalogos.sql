-- =====================================================================
-- TPC Recruitment Hub — Fase 2A (mejoras)
-- Migración 0810: catálogos reutilizables y personalización de procesos.
--
--   · Catálogo de etapas (categoría y tipo se asignan automáticamente).
--   · Catálogo de puestos con búsqueda (no limitado a perfiles predefinidos).
--   · Catálogo de requisitos con escalas de dominio configurables.
--   · Activar / desactivar sin borrar (sin permisos DELETE; FK RESTRICT).
--   · Procesos y requisitos por cliente, puesto y vacante (estructura).
--   · Duplicar procesos y copiar requisitos entre alcances.
--
-- Incremental: no modifica migraciones anteriores ni elimina datos.
-- Verificación: supabase/verification/0810_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo de etapas
-- ---------------------------------------------------------------------
create table public.stage_catalog (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 2 and 60),
  category            public.stage_category not null,
  stage_type          public.stage_type not null default 'general',
  default_target_days smallint check (default_target_days is null or default_target_days between 0 and 365),
  description         text check (description is null or char_length(description) <= 300),
  is_active           boolean not null default true,
  sort_order          integer not null default 100,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.stage_catalog is 'Catálogo de etapas de reclutamiento. Categoría y tipo se heredan al usarlas en un proceso.';
create unique index stage_catalog_name_uq on public.stage_catalog (lower(name));

insert into public.stage_catalog (name, category, stage_type, default_target_days, sort_order) values
  ('Nuevo',                        'nuevo',      'general',      2,    10),
  ('Preselección',                 'en_proceso', 'general',      3,    20),
  ('Entrevista',                   'en_proceso', 'entrevista',   5,    30),
  ('Entrevista con el cliente',    'en_proceso', 'entrevista',   5,    35),
  ('Prueba técnica',               'en_proceso', 'prueba',       5,    40),
  ('Prueba de Excel',              'en_proceso', 'prueba',       3,    41),
  ('Prueba de inglés',             'en_proceso', 'prueba',       3,    42),
  ('Verificación',                 'en_proceso', 'verificacion', 3,    50),
  ('Verificación de referencias',  'en_proceso', 'verificacion', 3,    51),
  ('Validación de documentos',     'en_proceso', 'verificacion', 3,    52),
  ('Oferta',                       'oferta',     'oferta',       3,    60),
  ('Contratado',                   'contratado', 'general',      null, 70),
  ('Descartado',                   'descartado', 'general',      null, 80),
  ('Retirado por el candidato',    'descartado', 'general',      null, 81);

-- Las etapas ya existentes en procesos se incorporan al catálogo (sin perder historial)
insert into public.stage_catalog (name, category, stage_type, sort_order)
select distinct on (lower(s.name)) s.name, s.category, s.stage_type, 90
from public.pipeline_stages s
where not exists (select 1 from public.stage_catalog c where lower(c.name) = lower(s.name))
order by lower(s.name), s.created_at;

alter table public.pipeline_stages
  add column catalog_stage_id uuid references public.stage_catalog (id) on delete restrict;
create index pipeline_stages_catalog_idx on public.pipeline_stages (catalog_stage_id);

update public.pipeline_stages s
set catalog_stage_id = c.id
from public.stage_catalog c
where lower(c.name) = lower(s.name) and s.catalog_stage_id is null;

-- ---------------------------------------------------------------------
-- 2) Catálogo de puestos (búsqueda; se pueden crear nuevos libremente)
-- ---------------------------------------------------------------------
create table public.job_positions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 150),
  area         text check (area is null or char_length(area) <= 100),
  description  text check (description is null or char_length(description) <= 500),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.job_positions is 'Catálogo de puestos / perfiles profesionales. Abierto: se agregan según se necesiten.';
create unique index job_positions_name_uq on public.job_positions (lower(name));
create index job_positions_name_trgm_idx on public.job_positions using gin (name extensions.gin_trgm_ops);

insert into public.job_positions (name, area) values
  ('Ejecutivo(a) de ventas',          'Comercial'),
  ('Agente de servicio al cliente',   'Servicio al cliente'),
  ('Recepcionista bilingüe',          'Administración'),
  ('Asistente administrativo(a)',     'Administración'),
  ('Auxiliar contable',               'Finanzas'),
  ('Analista de inventarios',         'Operaciones'),
  ('Bodeguero(a)',                    'Operaciones'),
  ('Operario(a) de producción',       'Producción'),
  ('Chofer',                          'Logística'),
  ('Misceláneo(a)',                   'Servicios generales');

-- Posiciones escritas como texto en requisitos existentes → al catálogo
insert into public.job_positions (name)
select distinct on (lower(r.position_title)) r.position_title
from public.requirement_templates r
where r.position_title is not null
  and not exists (select 1 from public.job_positions p where lower(p.name) = lower(r.position_title))
order by lower(r.position_title);

-- ---------------------------------------------------------------------
-- 3) Escalas y niveles de dominio configurables
-- ---------------------------------------------------------------------
create table public.proficiency_scales (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 80),
  description  text check (description is null or char_length(description) <= 300),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index proficiency_scales_name_uq on public.proficiency_scales (lower(name));

create table public.proficiency_levels (
  id           uuid primary key default gen_random_uuid(),
  scale_id     uuid not null references public.proficiency_scales (id) on delete restrict,
  position     smallint not null check (position between 1 and 20),
  label        text not null check (char_length(label) between 1 and 60),
  description  text check (description is null or char_length(description) <= 200),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint proficiency_levels_position_uq unique (scale_id, position)
);
create unique index proficiency_levels_label_uq on public.proficiency_levels (scale_id, lower(label));
comment on table public.proficiency_levels is 'Niveles ordenados de una escala (posición 1 = más bajo).';

with s as (
  insert into public.proficiency_scales (name, description) values
    ('Idiomas (MCER)',       'Marco Común Europeo de Referencia para las lenguas'),
    ('Dominio general',      'Nivel de manejo de una herramienta o habilidad'),
    ('Años de experiencia',  'Tiempo de experiencia comprobable'),
    ('Cumplimiento',         'Requisito que se cumple o no (licencias, carnés, títulos)')
  returning id, name
)
insert into public.proficiency_levels (scale_id, position, label)
select s.id, l.position, l.label
from s
join (values
  ('Idiomas (MCER)', 1, 'A1'), ('Idiomas (MCER)', 2, 'A2'), ('Idiomas (MCER)', 3, 'B1'),
  ('Idiomas (MCER)', 4, 'B2'), ('Idiomas (MCER)', 5, 'C1'), ('Idiomas (MCER)', 6, 'C2'),
  ('Idiomas (MCER)', 7, 'Nativo'),
  ('Dominio general', 1, 'Básico'), ('Dominio general', 2, 'Intermedio'),
  ('Dominio general', 3, 'Avanzado'), ('Dominio general', 4, 'Experto'),
  ('Años de experiencia', 1, 'Sin experiencia'), ('Años de experiencia', 2, 'Menos de 1 año'),
  ('Años de experiencia', 3, '1 a 2 años'), ('Años de experiencia', 4, '3 a 5 años'),
  ('Años de experiencia', 5, 'Más de 5 años'),
  ('Cumplimiento', 1, 'Cumple')
) as l(scale, position, label) on l.scale = s.name;

-- ---------------------------------------------------------------------
-- 4) Catálogo de requisitos reutilizables
-- ---------------------------------------------------------------------
create table public.requirement_catalog (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 200),
  category     public.requirement_category not null default 'otro',
  scale_id     uuid references public.proficiency_scales (id) on delete restrict,
  description  text check (description is null or char_length(description) <= 500),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.requirement_catalog is 'Requisitos reutilizables con su escala de dominio (opcional).';
create unique index requirement_catalog_name_uq on public.requirement_catalog (lower(name));
create index requirement_catalog_name_trgm_idx on public.requirement_catalog using gin (name extensions.gin_trgm_ops);

insert into public.requirement_catalog (name, category, scale_id)
select r.name, r.category::public.requirement_category, s.id
from (values
  ('Inglés',                                   'idioma',         'Idiomas (MCER)'),
  ('Microsoft Excel',                          'habilidad',      'Dominio general'),
  ('SAP',                                      'habilidad',      'Dominio general'),
  ('Experiencia en ventas',                    'experiencia',    'Años de experiencia'),
  ('Experiencia en servicio al cliente',       'experiencia',    'Años de experiencia'),
  ('Experiencia en bodega o inventarios',      'experiencia',    'Años de experiencia'),
  ('Bachillerato en educación media',          'formacion',      'Cumplimiento'),
  ('Licencia de conducir B1',                  'certificacion',  'Cumplimiento'),
  ('Licencia de conducir C1',                  'certificacion',  'Cumplimiento'),
  ('Carné de manipulación de alimentos',       'certificacion',  'Cumplimiento'),
  ('Disponibilidad para turnos rotativos',     'disponibilidad', 'Cumplimiento'),
  ('Disponibilidad para viajar',               'disponibilidad', 'Cumplimiento')
) as r(name, category, scale)
join public.proficiency_scales s on s.name = r.scale;

-- Requisitos escritos como texto en plantillas existentes → al catálogo
insert into public.requirement_catalog (name, category)
select distinct on (lower(t.requirement)) t.requirement, t.category
from public.requirement_templates t
where not exists (select 1 from public.requirement_catalog c where lower(c.name) = lower(t.requirement))
order by lower(t.requirement), t.created_at;

-- ---------------------------------------------------------------------
-- 5) Personalización por cliente, puesto y vacante
-- ---------------------------------------------------------------------
alter table public.pipeline_templates
  add column position_id uuid references public.job_positions (id) on delete restrict,
  add column vacancy_id  uuid references public.vacancies (id) on delete cascade,
  add column source_template_id uuid references public.pipeline_templates (id) on delete set null;
comment on column public.pipeline_templates.source_template_id is 'Plantilla de origen cuando se creó por duplicación (trazabilidad).';
create index pipeline_templates_position_idx on public.pipeline_templates (position_id);
create index pipeline_templates_vacancy_idx on public.pipeline_templates (vacancy_id);

-- Una plantilla predeterminada por alcance (cliente, puesto, vacante)
drop index public.pipeline_templates_one_default_idx;
create unique index pipeline_templates_one_default_scope_idx
  on public.pipeline_templates (
    coalesce(client_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(vacancy_id,  '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;

alter table public.requirement_templates
  add column catalog_requirement_id uuid references public.requirement_catalog (id) on delete restrict,
  add column position_id   uuid references public.job_positions (id) on delete restrict,
  add column min_level_id  uuid references public.proficiency_levels (id) on delete restrict,
  add column vacancy_id    uuid references public.vacancies (id) on delete cascade;
create index requirement_templates_scope_idx on public.requirement_templates (client_id, position_id, vacancy_id);

update public.requirement_templates t
set catalog_requirement_id = c.id
from public.requirement_catalog c
where lower(c.name) = lower(t.requirement) and t.catalog_requirement_id is null;

update public.requirement_templates t
set position_id = p.id
from public.job_positions p
where t.position_title is not null and lower(p.name) = lower(t.position_title) and t.position_id is null;

-- ---------------------------------------------------------------------
-- 6) Consistencia con los catálogos (asignación automática en la BD)
-- ---------------------------------------------------------------------
create or replace function private.sync_stage_from_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.stage_catalog%rowtype;
begin
  if new.catalog_stage_id is not null then
    select * into c from public.stage_catalog where id = new.catalog_stage_id;
    if not found then
      raise exception 'La etapa seleccionada no existe en el catálogo' using errcode = '23503';
    end if;
    new.name := c.name;
    new.category := c.category;
    new.stage_type := c.stage_type;
    if new.target_days is null then
      new.target_days := c.default_target_days;
    end if;
  end if;
  return new;
end;
$$;

create trigger pipeline_stages_sync_catalog
  before insert or update on public.pipeline_stages
  for each row execute function private.sync_stage_from_catalog();

create or replace function private.sync_requirement_from_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.requirement_catalog%rowtype;
  v_level_scale uuid;
  v_level_label text;
  v_position text;
begin
  if new.catalog_requirement_id is not null then
    select * into c from public.requirement_catalog where id = new.catalog_requirement_id;
    if not found then
      raise exception 'El requisito seleccionado no existe en el catálogo' using errcode = '23503';
    end if;
    new.requirement := c.name;
    new.category := c.category;
  end if;

  if new.min_level_id is not null then
    select l.scale_id, l.label into v_level_scale, v_level_label
    from public.proficiency_levels l where l.id = new.min_level_id;
    if new.catalog_requirement_id is null or c.scale_id is null or v_level_scale is distinct from c.scale_id then
      raise exception 'El nivel no corresponde a la escala del requisito' using errcode = '23514';
    end if;
    new.expected_level := v_level_label;
  end if;

  if new.position_id is not null then
    select p.name into v_position from public.job_positions p where p.id = new.position_id;
    new.position_title := v_position;
  end if;
  return new;
end;
$$;

create trigger requirement_templates_sync_catalog
  before insert or update on public.requirement_templates
  for each row execute function private.sync_requirement_from_catalog();

revoke all on function private.sync_stage_from_catalog() from public, authenticated;
revoke all on function private.sync_requirement_from_catalog() from public, authenticated;

-- ---------------------------------------------------------------------
-- 7) Triggers comunes, permisos y RLS de los catálogos
--    Sin DELETE: los elementos se desactivan para conservar el historial.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['stage_catalog', 'job_positions', 'proficiency_scales', 'proficiency_levels', 'requirement_catalog'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_set_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
    execute format('create trigger %1$s_keep_created_by before update on public.%1$I for each row execute function private.keep_created_by()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.write_audit_log()', t);
    execute format('revoke all on public.%1$I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%1$I to authenticated', t);
    execute format('alter table public.%1$I enable row level security', t);
    execute format('alter table public.%1$I force row level security', t);
    execute format('create policy "%1$s: leer (activos)" on public.%1$I for select to authenticated using ((select private.is_active_user()))', t);
    execute format('create policy "%1$s: crear (admin, coord)" on public.%1$I for insert to authenticated with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
    execute format('create policy "%1$s: editar (admin, coord)" on public.%1$I for update to authenticated using ((select private.has_any_role(''admin'', ''coordinador''))) with check ((select private.has_any_role(''admin'', ''coordinador'')))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Guardado de etapas basado en el catálogo (reemplaza la versión 0800,
--    compatible con ella: elementos sin catalog_stage_id usan name/category).
-- ---------------------------------------------------------------------
create or replace function public.save_pipeline_stages(p_template_id uuid, p_stages jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_item record;
  v_cat public.stage_catalog%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_categories text[] := '{}'::text[];
  v_names text[] := '{}'::text[];
  v_name text;
  v_category text;
  v_type text;
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

  -- 1) Validar y resolver cada etapa (antes de modificar nada)
  for v_item in select e.val, e.ord from jsonb_array_elements(p_stages) with ordinality as e(val, ord) loop
    if nullif(v_item.val ->> 'catalog_stage_id', '') is not null then
      select * into v_cat from public.stage_catalog where id = (v_item.val ->> 'catalog_stage_id')::uuid;
      if not found then
        raise exception 'Una etapa seleccionada no existe en el catálogo' using errcode = '23503';
      end if;
      if not v_cat.is_active and not exists (
        select 1 from public.pipeline_stages s where s.template_id = p_template_id and s.catalog_stage_id = v_cat.id
      ) then
        raise exception 'La etapa «%» está inactiva en el catálogo', v_cat.name using errcode = '23514';
      end if;
      v_name := v_cat.name;
      v_category := v_cat.category::text;
      v_type := v_cat.stage_type::text;
    else
      v_name := trim(v_item.val ->> 'name');
      v_category := v_item.val ->> 'category';
      v_type := coalesce(nullif(v_item.val ->> 'stage_type', ''), 'general');
    end if;

    if lower(v_name) = any (v_names) then
      raise exception 'La etapa «%» está repetida en el proceso', v_name using errcode = '23514';
    end if;
    v_names := v_names || lower(v_name);
    v_categories := v_categories || v_category;
    v_rows := v_rows || jsonb_build_object(
      'ord', v_item.ord,
      'catalog_stage_id', nullif(v_item.val ->> 'catalog_stage_id', ''),
      'name', v_name, 'category', v_category, 'stage_type', v_type,
      'target_days', nullif(v_item.val ->> 'target_days', ''));
  end loop;

  if not ('nuevo' = any (v_categories)) or not ('contratado' = any (v_categories)) or not ('descartado' = any (v_categories)) then
    raise exception 'El proceso debe incluir etapas de categoría nuevo, contratado y descartado'
      using errcode = '23514';
  end if;

  -- 2) Reemplazar las etapas en una sola transacción
  delete from public.pipeline_stages where template_id = p_template_id;

  insert into public.pipeline_stages (template_id, position, catalog_stage_id, name, category, stage_type, target_days)
  select p_template_id,
         (r ->> 'ord')::smallint,
         (r ->> 'catalog_stage_id')::uuid,
         r ->> 'name',
         (r ->> 'category')::public.stage_category,
         (r ->> 'stage_type')::public.stage_type,
         (r ->> 'target_days')::smallint
  from jsonb_array_elements(v_rows) r;

  update public.pipeline_templates set updated_at = now() where id = p_template_id;
end;
$$;

revoke all on function public.save_pipeline_stages(uuid, jsonb) from public, anon;
grant execute on function public.save_pipeline_stages(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 9) Duplicar procesos y copiar requisitos (SECURITY INVOKER: respeta RLS)
-- ---------------------------------------------------------------------
create or replace function public.duplicate_pipeline_template(
  p_source_id uuid,
  p_client_id uuid default null,
  p_position_id uuid default null,
  p_vacancy_id uuid default null,
  p_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.pipeline_templates%rowtype;
  v_new uuid;
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_source from public.pipeline_templates where id = p_source_id;
  if not found then
    raise exception 'El proceso de origen no existe' using errcode = '23503';
  end if;

  if exists (
    select 1 from public.pipeline_templates t
    where t.is_default
      and t.client_id is not distinct from p_client_id
      and t.position_id is not distinct from p_position_id
      and t.vacancy_id is not distinct from p_vacancy_id
  ) then
    raise exception 'Ya existe un proceso para ese cliente, puesto o vacante' using errcode = '23505';
  end if;

  insert into public.pipeline_templates (client_id, position_id, vacancy_id, name, description, is_default, source_template_id)
  values (p_client_id, p_position_id, p_vacancy_id,
          coalesce(nullif(trim(p_name), ''), v_source.name || ' (copia)'),
          v_source.description, false, v_source.id)
  returning id into v_new;

  insert into public.pipeline_stages (template_id, position, catalog_stage_id, name, category, stage_type, target_days)
  select v_new, s.position, s.catalog_stage_id, s.name, s.category, s.stage_type, s.target_days
  from public.pipeline_stages s
  where s.template_id = p_source_id;

  update public.pipeline_templates set is_default = true where id = v_new;
  return v_new;
end;
$$;

create or replace function public.copy_requirement_templates(
  p_from_client_id uuid,
  p_from_position_id uuid,
  p_to_client_id uuid,
  p_to_position_id uuid
)
returns integer
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
  if p_from_client_id is not distinct from p_to_client_id and p_from_position_id is not distinct from p_to_position_id then
    raise exception 'El origen y el destino son el mismo' using errcode = '23514';
  end if;

  insert into public.requirement_templates
    (client_id, position_id, vacancy_id, catalog_requirement_id, min_level_id,
     position_title, requirement, requirement_type, category, expected_level, weight)
  select p_to_client_id, p_to_position_id, null, s.catalog_requirement_id, s.min_level_id,
         case when p_to_position_id is null then null else s.position_title end,
         s.requirement, s.requirement_type, s.category, s.expected_level, s.weight
  from public.requirement_templates s
  where s.is_active
    and s.vacancy_id is null
    and s.client_id is not distinct from p_from_client_id
    and s.position_id is not distinct from p_from_position_id
    and not exists (
      select 1 from public.requirement_templates d
      where d.client_id is not distinct from p_to_client_id
        and d.position_id is not distinct from p_to_position_id
        and d.vacancy_id is null
        and lower(d.requirement) = lower(s.requirement)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Proceso aplicable: vacante → cliente+puesto → cliente → puesto (global) → estándar TPC
create or replace function public.resolve_pipeline_template(
  p_client_id uuid default null,
  p_position_id uuid default null,
  p_vacancy_id uuid default null
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id
  from public.pipeline_templates t
  where t.is_default and t.is_active
    and (
      (p_vacancy_id is not null and t.vacancy_id = p_vacancy_id)
      or (t.vacancy_id is null and p_client_id is not null and p_position_id is not null
          and t.client_id = p_client_id and t.position_id = p_position_id)
      or (t.vacancy_id is null and p_client_id is not null and t.client_id = p_client_id and t.position_id is null)
      or (t.vacancy_id is null and p_position_id is not null and t.client_id is null and t.position_id = p_position_id)
      or (t.vacancy_id is null and t.client_id is null and t.position_id is null)
    )
  order by
    case
      when t.vacancy_id is not null then 1
      when t.client_id is not null and t.position_id is not null then 2
      when t.client_id is not null then 3
      when t.position_id is not null then 4
      else 5
    end
  limit 1
$$;

revoke all on function public.duplicate_pipeline_template(uuid, uuid, uuid, uuid, text) from public, anon;
revoke all on function public.copy_requirement_templates(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.resolve_pipeline_template(uuid, uuid, uuid) from public, anon;
grant execute on function public.duplicate_pipeline_template(uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.copy_requirement_templates(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.resolve_pipeline_template(uuid, uuid, uuid) to authenticated;
