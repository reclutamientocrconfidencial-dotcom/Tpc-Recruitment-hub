-- =====================================================================
-- TPC Recruitment Hub — Fase 5: inteligencia artificial modular.
-- Migración 1400 (incremental y compatible).
--   1. Configuración de IA (apagada por omisión): proveedor, modelo,
--      presupuesto mensual, límite diario por usuario y confirmación del
--      acuerdo de tratamiento de datos (requisito para un proveedor externo).
--   2. Registro de cada uso: función, proveedor, modelo, tokens y costo.
--      No se guarda el texto enviado (solo su huella); el resultado se guarda
--      para la revisión humana obligatoria.
--   3. Controles en la BD: IA habilitada, rol operativo, límite diario por
--      usuario y presupuesto mensual; un resultado no se usa sin revisión.
-- Verificación: supabase/verification/1400_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuración
-- ---------------------------------------------------------------------
create table public.ai_settings (
  id                      boolean primary key default true check (id),
  enabled                 boolean not null default false,
  provider                text not null default 'simulado' check (provider in ('simulado', 'anthropic')),
  model                   text not null default 'claude-opus-5-5' check (model ~ '^[a-z0-9.-]{3,60}$'),
  monthly_budget_usd      numeric(10, 2) not null default 0 check (monthly_budget_usd between 0 and 100000),
  daily_requests_per_user integer not null default 20 check (daily_requests_per_user between 1 and 500),
  dpa_confirmed           boolean not null default false,
  dpa_note                text check (dpa_note is null or char_length(dpa_note) <= 500),
  updated_by              uuid references public.profiles (id) on delete set null,
  updated_at              timestamptz not null default now(),
  -- Proveedor externo: solo con acuerdo de tratamiento de datos y presupuesto autorizado.
  check (not (enabled and provider = 'anthropic') or (dpa_confirmed and monthly_budget_usd > 0))
);
comment on table public.ai_settings is 'Configuración de IA. Un proveedor externo exige acuerdo de tratamiento de datos y presupuesto.';
insert into public.ai_settings (id) values (true);

create or replace function private.ai_settings_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.enabled and new.provider = 'anthropic' and not (new.dpa_confirmed and new.monthly_budget_usd > 0) then
    raise exception 'Para usar un proveedor externo confirme el acuerdo de tratamiento de datos y defina un presupuesto mayor a cero' using errcode = '23514';
  end if;
  -- Activar un proveedor externo exige verificación en dos pasos en la sesión (aal2).
  if new.enabled and new.provider = 'anthropic'
     and (not old.enabled or old.provider <> 'anthropic' or new.monthly_budget_usd > old.monthly_budget_usd)
     and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Para activar un proveedor externo o ampliar su presupuesto inicie sesión con verificación en dos pasos' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
create trigger ai_settings_rules before update on public.ai_settings for each row execute function private.ai_settings_rules();

alter table public.ai_settings enable row level security;
alter table public.ai_settings force row level security;
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
grant update (enabled, provider, model, monthly_budget_usd, daily_requests_per_user, dpa_confirmed, dpa_note) on public.ai_settings to authenticated;
create policy "ai_settings: leer (activos)" on public.ai_settings for select to authenticated using ((select private.is_active_user()));
create policy "ai_settings: editar (admin)" on public.ai_settings for update to authenticated
  using ((select private.has_any_role('admin'))) with check ((select private.has_any_role('admin')));
-- Bitácora de cambios de configuración (tabla de una fila: sin id uuid; solo nombres de campos)
create or replace function private.write_audit_log_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[];
begin
  select coalesce(array_agg(k order by k), '{}') into v_fields
  from jsonb_object_keys(to_jsonb(new)) k
  where k not in ('updated_at', 'updated_by') and to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  if cardinality(v_fields) > 0 then
    insert into public.audit_logs (table_name, record_id, action, changed_fields, actor_id)
    values (tg_table_name, null, tg_op, v_fields, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.write_audit_log_settings() from public, anon, authenticated;
create trigger ai_settings_audit after update on public.ai_settings for each row execute function private.write_audit_log_settings();

-- ---------------------------------------------------------------------
-- 2) Registro de uso
-- ---------------------------------------------------------------------
create table public.ai_requests (
  id              uuid primary key default gen_random_uuid(),
  feature         text not null check (feature in ('extraer_cv', 'comparar', 'preguntas', 'borrador_informe', 'publicacion')),
  user_id         uuid references public.profiles (id) on delete set null,
  provider        text not null,
  model           text not null,
  status          text not null default 'en_proceso'
                  check (status in ('en_proceso', 'pendiente_revision', 'aceptado', 'descartado', 'error')),
  candidate_id    uuid references public.candidates (id) on delete cascade,
  vacancy_id      uuid references public.vacancies (id) on delete cascade,
  application_id  uuid references public.applications (id) on delete cascade,
  input_hash      text check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),   -- huella del texto enviado (no el texto)
  pseudonymized   boolean not null default false,
  output          jsonb check (output is null or pg_column_size(output) <= 100000),
  input_tokens    integer check (input_tokens is null or input_tokens >= 0),
  output_tokens   integer check (output_tokens is null or output_tokens >= 0),
  cost_usd        numeric(10, 4) not null default 0 check (cost_usd >= 0),
  error           text check (error is null or char_length(error) <= 300),
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 300),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index ai_requests_user_day_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_month_idx on public.ai_requests (created_at desc);
create index ai_requests_application_idx on public.ai_requests (application_id, created_at desc);
create index ai_requests_vacancy_idx on public.ai_requests (vacancy_id, created_at desc);
create index ai_requests_candidate_idx on public.ai_requests (candidate_id, created_at desc);

-- ¿Puede ver la solicitud? Quien la hizo, coordinación y administración.
create or replace function private.can_view_ai_request(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador') or (private.is_operational() and p_user_id = auth.uid())
$$;
revoke all on function private.can_view_ai_request(uuid) from public;
grant execute on function private.can_view_ai_request(uuid) to authenticated;

alter table public.ai_requests enable row level security;
alter table public.ai_requests force row level security;
revoke all on public.ai_requests from anon, authenticated;
grant select on public.ai_requests to authenticated;
create policy "ai_requests: leer" on public.ai_requests for select to authenticated using (private.can_view_ai_request(user_id));
create trigger ai_requests_audit after insert or update or delete on public.ai_requests for each row execute function private.write_audit_log();

-- Costo del mes en curso (hora de Costa Rica)
create or replace function private.ai_month_cost()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_usd), 0) from public.ai_requests
  where created_at >= date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica'
$$;
revoke all on function private.ai_month_cost() from public, anon, authenticated;

-- Inicia una solicitud: valida habilitación, permisos sobre el objeto, límite diario y presupuesto.
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
  if p_feature not in ('extraer_cv', 'comparar', 'preguntas', 'borrador_informe', 'publicacion') then
    raise exception 'Función de IA no válida' using errcode = '22023';
  end if;
  -- Permiso sobre el objeto analizado
  if p_application_id is not null and not private.can_view_application_detail(p_application_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_candidate_id is not null and not private.can_view_candidate_private(p_candidate_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_vacancy_id is not null and not (private.has_any_role('admin', 'coordinador') or private.is_assigned_to_vacancy(p_vacancy_id)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  -- Límites
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

-- Cierra la solicitud con el resultado (queda pendiente de revisión) o con el error.
create or replace function public.ai_finish_request(p_id uuid, p_output jsonb, p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.ai_requests%rowtype;
begin
  select * into r from public.ai_requests where id = p_id for update;
  if not found or r.user_id is distinct from auth.uid() or r.status <> 'en_proceso' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.ai_requests set
    status = case when p_error is null then 'pendiente_revision' else 'error' end,
    output = case when p_error is null then p_output end,
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    cost_usd = case when r.provider = 'simulado' then 0 else greatest(coalesce(p_cost_usd, 0), 0) end,
    error = left(p_error, 300),
    finished_at = now()
  where id = p_id;
end;
$$;

-- Revisión humana obligatoria: solo un resultado «aceptado» puede aplicarse.
create or replace function public.ai_review_request(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.ai_requests%rowtype;
begin
  select * into r from public.ai_requests where id = p_id for update;
  if not found or not private.can_view_ai_request(r.user_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if r.status <> 'pendiente_revision' then
    raise exception 'Este resultado ya fue revisado o no está listo' using errcode = '23514';
  end if;
  if p_decision not in ('aceptado', 'descartado') then
    raise exception 'Decisión no válida' using errcode = '22023';
  end if;
  update public.ai_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         -- Minimización: un resultado descartado no se conserva.
         output = case when p_decision = 'descartado' then null else output end
  where id = p_id;
end;
$$;

-- Resumen de uso del mes (administración y coordinación)
create or replace function public.ai_usage_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.ai_settings%rowtype;
  v_start timestamptz := date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica';
begin
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into s from public.ai_settings where id;
  return jsonb_build_object(
    'month_cost', private.ai_month_cost(),
    'budget', s.monthly_budget_usd,
    'requests', (select count(*) from public.ai_requests where created_at >= v_start),
    'accepted', (select count(*) from public.ai_requests where created_at >= v_start and status = 'aceptado'),
    'discarded', (select count(*) from public.ai_requests where created_at >= v_start and status = 'descartado'),
    'errors', (select count(*) from public.ai_requests where created_at >= v_start and status = 'error'),
    'by_feature', coalesce((select jsonb_object_agg(feature, n) from (select feature, count(*) n from public.ai_requests where created_at >= v_start group by feature) x), '{}'::jsonb),
    'by_user', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Usuario eliminado'), 'requests', x.n, 'cost', x.c) order by x.c desc, x.n desc)
                         from (select user_id, count(*) n, sum(cost_usd) c from public.ai_requests where created_at >= v_start group by user_id) x
                         left join public.profiles p on p.id = x.user_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ai_begin_request(text, uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.ai_begin_request(text, uuid, uuid, uuid, text, boolean) to authenticated;
revoke all on function public.ai_finish_request(uuid, jsonb, integer, integer, numeric, text) from public, anon;
grant execute on function public.ai_finish_request(uuid, jsonb, integer, integer, numeric, text) to authenticated;
revoke all on function public.ai_review_request(uuid, text, text) from public, anon;
grant execute on function public.ai_review_request(uuid, text, text) to authenticated;
revoke all on function public.ai_usage_summary() from public, anon;
grant execute on function public.ai_usage_summary() to authenticated;
revoke all on function private.ai_settings_rules() from public, anon, authenticated;

