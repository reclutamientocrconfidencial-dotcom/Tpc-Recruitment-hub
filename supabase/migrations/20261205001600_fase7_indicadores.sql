-- =====================================================================
-- TPC Recruitment Hub — Fase 7: indicadores gerenciales y exportaciones
-- controladas. Migración 1600 (incremental; solo funciones de lectura).
--   1. Indicadores agregados (sin datos personales): resumen ejecutivo,
--      embudo y motivos de descarte, tiempos por etapa, fuentes más
--      efectivas, desempeño por reclutador y por cliente.
--      Alcance: admin, coordinación y consulta ven todo; el reclutador solo
--      lo de sus postulaciones y vacantes asignadas.
--   2. Exportaciones controladas: rol autorizado, motivo obligatorio,
--      límite de filas, cuota diaria y registro en access_logs ANTES de
--      entregar los datos. Las exportaciones nunca incluyen cédula ni
--      datos de contacto.
-- Verificación: supabase/verification/1600_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Alcance y período
-- ---------------------------------------------------------------------
create or replace function private.analytics_full_scope()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role('admin', 'coordinador', 'consulta')
$$;
revoke all on function private.analytics_full_scope() from public, anon, authenticated;

-- Postulaciones que el usuario puede considerar en los indicadores.
create or replace function private.analytics_applications(p_client uuid)
returns table (id uuid, vacancy_id uuid, client_id uuid, candidate_id uuid, recruiter_id uuid, applied_at timestamptz,
               hired_at timestamptz, stage_id uuid, discard_reason text, source_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.id, a.vacancy_id, r.client_id, a.candidate_id, a.recruiter_id, a.applied_at, a.hired_at, a.stage_id, a.discard_reason,
         coalesce(a.intake_channel_id, c.intake_channel_id)
  from public.applications a
  join public.vacancies v on v.id = a.vacancy_id
  join public.requisitions r on r.id = v.requisition_id
  join public.candidates c on c.id = a.candidate_id
  where (p_client is null or r.client_id = p_client)
    and (private.analytics_full_scope()
         or (private.has_any_role('reclutador') and (a.recruiter_id = auth.uid() or private.is_assigned_to_vacancy(a.vacancy_id))))
$$;
revoke all on function private.analytics_applications(uuid) from public, anon, authenticated;

create or replace function private.analytics_period(p_from date, p_to date, out v_from timestamptz, out v_to timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_user() or not private.has_any_role('admin', 'coordinador', 'consulta', 'reclutador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_from := (coalesce(p_from, (now() at time zone 'America/Costa_Rica')::date - 90)::timestamp at time zone 'America/Costa_Rica');
  v_to := ((coalesce(p_to, (now() at time zone 'America/Costa_Rica')::date) + 1)::timestamp at time zone 'America/Costa_Rica');
  if v_to <= v_from or v_to - v_from > interval '732 days' then
    raise exception 'Rango de fechas no válido (máximo dos años)' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.analytics_period(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) Indicadores
-- ---------------------------------------------------------------------
create or replace function public.analytics_summary(p_from date default null, p_to date default null, p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
  v_full boolean := private.analytics_full_scope();
begin
  select * into p from private.analytics_period(p_from, p_to);
  return (
    with apps as (select * from private.analytics_applications(p_client)),
         vac as (
           select v.* from public.vacancies v join public.requisitions r on r.id = v.requisition_id
           where (p_client is null or r.client_id = p_client)
             and (v_full or private.is_assigned_to_vacancy(v.id))
         )
    select jsonb_build_object(
      'open_requisitions', (select count(*) from public.requisitions r where r.status in ('aprobada', 'en_proceso')
                              and (p_client is null or r.client_id = p_client)
                              and (v_full or exists (select 1 from vac where vac.requisition_id = r.id))),
      'open_vacancies', (select count(*) from vac where status in ('abierta', 'pausada')),
      'openings_open', (select coalesce(sum(openings), 0) from vac where status in ('abierta', 'pausada')),
      'filled_open', (select coalesce(sum(filled_count), 0) from vac where status in ('abierta', 'pausada')),
      'overdue_vacancies', (select count(*) from vac where status in ('abierta', 'pausada') and closes_at < (now() at time zone 'America/Costa_Rica')::date),
      'applications', (select count(*) from apps where applied_at >= p.v_from and applied_at < p.v_to),
      'hires', (select count(*) from apps where hired_at >= p.v_from and hired_at < p.v_to),
      'avg_days_to_hire', (select round(avg(extract(epoch from (hired_at - applied_at)) / 86400)::numeric, 1) from apps where hired_at >= p.v_from and hired_at < p.v_to),
      'active_pipeline', (select count(*) from apps a join public.vacancy_stages s on s.id = a.stage_id where s.category in ('nuevo', 'en_proceso')),
      'scope', case when v_full then 'global' else 'propio' end
    )
  );
end;
$$;

-- Embudo: postulaciones del período por tipo de etapa actual, y motivos de descarte.
create or replace function public.analytics_funnel(p_from date default null, p_to date default null, p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  select * into p from private.analytics_period(p_from, p_to);
  return (
    with apps as (select a.*, s.category from private.analytics_applications(p_client) a
                  left join public.vacancy_stages s on s.id = a.stage_id
                  where a.applied_at >= p.v_from and a.applied_at < p.v_to)
    select jsonb_build_object(
      'by_category', coalesce((select jsonb_object_agg(coalesce(category::text, 'sin_etapa'), n) from (select category, count(*) n from apps group by category) x), '{}'::jsonb),
      'discard_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', discard_reason, 'count', n) order by n desc)
                                    from (select discard_reason, count(*) n from apps where discard_reason is not null group by discard_reason) x), '[]'::jsonb)
    )
  );
end;
$$;

-- Tiempos por etapa: días de permanencia (etapas ya concluidas) según el historial.
create or replace function public.analytics_stage_times(p_from date default null, p_to date default null, p_client uuid default null)
returns table (stage_name text, category text, transitions integer, avg_days numeric, median_days numeric, target_days numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  select * into p from private.analytics_period(p_from, p_to);
  return query
    with apps as (select id from private.analytics_applications(p_client)),
         ev as (
           select e.application_id, e.to_stage_id, e.created_at,
                  lead(e.created_at) over (partition by e.application_id order by e.created_at, e.id) as left_at
           from public.application_events e
           where e.event_type in ('creada', 'cambio_etapa') and e.application_id in (select id from apps)
         )
    select s.name, s.category::text, count(*)::integer,
           round(avg(extract(epoch from (ev.left_at - ev.created_at)) / 86400)::numeric, 1),
           round((percentile_cont(0.5) within group (order by extract(epoch from (ev.left_at - ev.created_at)) / 86400))::numeric, 1),
           round(avg(s.target_days)::numeric, 1)
    from ev join public.vacancy_stages s on s.id = ev.to_stage_id
    where ev.left_at is not null and ev.left_at >= p.v_from and ev.left_at < p.v_to
    group by s.name, s.category
    order by min(s.position), s.name;
end;
$$;

-- Fuentes más efectivas
create or replace function public.analytics_sources(p_from date default null, p_to date default null, p_client uuid default null)
returns table (source text, applications integer, hires integer, hire_rate numeric, avg_days_to_hire numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  select * into p from private.analytics_period(p_from, p_to);
  return query
    with apps as (select * from private.analytics_applications(p_client) where applied_at >= p.v_from and applied_at < p.v_to)
    select coalesce(ch.name, 'Sin fuente registrada'), count(*)::integer, count(a.hired_at)::integer,
           round(100.0 * count(a.hired_at) / nullif(count(*), 0), 1),
           round(avg(extract(epoch from (a.hired_at - a.applied_at)) / 86400)::numeric, 1)
    from apps a left join public.intake_channels ch on ch.id = a.source_id
    group by ch.name
    order by count(a.hired_at) desc, count(*) desc;
end;
$$;

-- Desempeño por reclutador (el reclutador solo ve su fila)
create or replace function public.analytics_recruiters(p_from date default null, p_to date default null, p_client uuid default null)
returns table (recruiter_id uuid, full_name text, active_applications integer, applications integer, hires integer,
               avg_days_to_hire numeric, interviews_done integer, reports_finalized integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
begin
  select * into p from private.analytics_period(p_from, p_to);
  return query
    with apps as (select a.*, s.category from private.analytics_applications(p_client) a left join public.vacancy_stages s on s.id = a.stage_id)
    select pr.id, pr.full_name,
      (select count(*)::integer from apps a where a.recruiter_id = pr.id and a.category in ('nuevo', 'en_proceso')),
      (select count(*)::integer from apps a where a.recruiter_id = pr.id and a.applied_at >= p.v_from and a.applied_at < p.v_to),
      (select count(*)::integer from apps a where a.recruiter_id = pr.id and a.hired_at >= p.v_from and a.hired_at < p.v_to),
      (select round(avg(extract(epoch from (a.hired_at - a.applied_at)) / 86400)::numeric, 1) from apps a where a.recruiter_id = pr.id and a.hired_at >= p.v_from and a.hired_at < p.v_to),
      (select count(*)::integer from public.interviews i join apps a on a.id = i.application_id where i.interviewer_id = pr.id and i.status = 'realizada' and i.completed_at >= p.v_from and i.completed_at < p.v_to),
      (select count(*)::integer from public.executive_reports r join apps a on a.id = r.application_id where r.finalized_by = pr.id and r.finalized_at >= p.v_from and r.finalized_at < p.v_to)
    from public.profiles pr
    where pr.is_active and pr.role in ('admin', 'coordinador', 'reclutador')
      and (private.analytics_full_scope() or pr.id = auth.uid())
    order by 5 desc, 4 desc, pr.full_name;
end;
$$;

-- Desempeño por cliente
create or replace function public.analytics_clients(p_from date default null, p_to date default null)
returns table (client_id uuid, client_name text, open_requisitions integer, open_vacancies integer, openings integer, filled integer,
               applications integer, hires integer, avg_days_to_hire numeric, overdue_vacancies integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
  v_full boolean := private.analytics_full_scope();
begin
  select * into p from private.analytics_period(p_from, p_to);
  return query
    with apps as (select * from private.analytics_applications(null)),
         vac as (select v.*, r.client_id as cid from public.vacancies v join public.requisitions r on r.id = v.requisition_id
                 where v_full or private.is_assigned_to_vacancy(v.id))
    select c.id, c.name,
      (select count(*)::integer from public.requisitions r where r.client_id = c.id and r.status in ('aprobada', 'en_proceso')
         and (v_full or exists (select 1 from vac where vac.requisition_id = r.id))),
      (select count(*)::integer from vac where vac.cid = c.id and vac.status in ('abierta', 'pausada')),
      (select coalesce(sum(vac.openings), 0)::integer from vac where vac.cid = c.id and vac.status in ('abierta', 'pausada')),
      (select coalesce(sum(vac.filled_count), 0)::integer from vac where vac.cid = c.id and vac.status in ('abierta', 'pausada')),
      (select count(*)::integer from apps a where a.client_id = c.id and a.applied_at >= p.v_from and a.applied_at < p.v_to),
      (select count(*)::integer from apps a where a.client_id = c.id and a.hired_at >= p.v_from and a.hired_at < p.v_to),
      (select round(avg(extract(epoch from (a.hired_at - a.applied_at)) / 86400)::numeric, 1) from apps a where a.client_id = c.id and a.hired_at >= p.v_from and a.hired_at < p.v_to),
      (select count(*)::integer from vac where vac.cid = c.id and vac.status in ('abierta', 'pausada') and vac.closes_at < (now() at time zone 'America/Costa_Rica')::date)
    from public.clients c
    where c.status <> 'inactivo'
      and (v_full or exists (select 1 from vac where vac.cid = c.id))
    order by 8 desc, 4 desc, c.name;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Exportaciones controladas
-- ---------------------------------------------------------------------
-- Conjuntos y roles: indicadores (admin, coord) · postulaciones (admin, coord) · candidatos (solo admin).
-- Nunca se exportan cédula, correo, teléfono, pretensión salarial ni notas.
create or replace function public.export_dataset(p_dataset text, p_reason text, p_from date default null, p_to date default null, p_client uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_limit constant integer := 5000;
  v_daily constant integer := 20;
  v_rows jsonb;
  v_cols jsonb;
  v_count integer;
begin
  select * into p from private.analytics_period(p_from, p_to);
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Indique el motivo de la exportación (mínimo 10 caracteres)' using errcode = '23514';
  end if;
  if p_dataset = 'candidatos' and not private.has_any_role('admin') then
    raise exception 'Solo administración exporta la base de candidatos' using errcode = '42501';
  end if;
  if not private.has_any_role('admin', 'coordinador') then
    raise exception 'No tiene permiso para exportar' using errcode = '42501';
  end if;
  if (select count(*) from public.access_logs l where l.actor_id = auth.uid() and l.action = 'exportar'
        and l.created_at >= date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica') >= v_daily then
    raise exception 'Alcanzó el límite de % exportaciones por día', v_daily using errcode = '23514';
  end if;

  case p_dataset
    when 'indicadores_clientes' then
      select jsonb_agg(to_jsonb(x)) into v_rows from public.analytics_clients(p_from, p_to) x;
      v_cols := '["client_name","open_requisitions","open_vacancies","openings","filled","applications","hires","avg_days_to_hire","overdue_vacancies"]';
    when 'indicadores_reclutadores' then
      select jsonb_agg(to_jsonb(x)) into v_rows from public.analytics_recruiters(p_from, p_to, p_client) x;
      v_cols := '["full_name","active_applications","applications","hires","avg_days_to_hire","interviews_done","reports_finalized"]';
    when 'fuentes' then
      select jsonb_agg(to_jsonb(x)) into v_rows from public.analytics_sources(p_from, p_to, p_client) x;
      v_cols := '["source","applications","hires","hire_rate","avg_days_to_hire"]';
    when 'tiempos_etapa' then
      select jsonb_agg(to_jsonb(x)) into v_rows from public.analytics_stage_times(p_from, p_to, p_client) x;
      v_cols := '["stage_name","category","transitions","avg_days","median_days","target_days"]';
    when 'postulaciones' then
      select jsonb_agg(row order by row ->> 'postulacion') into v_rows from (
        select jsonb_build_object(
          'postulacion', to_char(a.applied_at at time zone 'America/Costa_Rica', 'YYYY-MM-DD'),
          'candidato', c.first_name || ' ' || c.last_name,
          'vacante', v.code || ' · ' || v.title,
          'cliente', cl.name,
          'etapa', s.name,
          'tipo_etapa', s.category,
          'contratacion', to_char(a.hired_at at time zone 'America/Costa_Rica', 'YYYY-MM-DD'),
          'motivo_descarte', a.discard_reason,
          'fuente', ch.name,
          'responsable', pr.full_name) as row
        from public.applications a
        join public.vacancies v on v.id = a.vacancy_id
        join public.requisitions r on r.id = v.requisition_id
        join public.clients cl on cl.id = r.client_id
        join public.candidates c on c.id = a.candidate_id
        left join public.vacancy_stages s on s.id = a.stage_id
        left join public.intake_channels ch on ch.id = coalesce(a.intake_channel_id, c.intake_channel_id)
        left join public.profiles pr on pr.id = a.recruiter_id
        where a.applied_at >= p.v_from and a.applied_at < p.v_to and (p_client is null or r.client_id = p_client)
        order by a.applied_at
        limit v_limit + 1) x;
      v_cols := '["postulacion","candidato","vacante","cliente","etapa","tipo_etapa","contratacion","motivo_descarte","fuente","responsable"]';
    when 'candidatos' then
      select jsonb_agg(row) into v_rows from (
        select jsonb_build_object(
          'nombre', c.first_name || ' ' || c.last_name,
          'provincia', c.province, 'canton', c.canton,
          'ocupacion', c.current_title, 'experiencia', c.years_experience, 'ingles', c.english_level,
          'perfiles', (select string_agg(jp.name, ', ') from public.candidate_profiles cp join public.job_positions jp on jp.id = cp.position_id where cp.candidate_id = c.id),
          'estado', c.status, 'consentimiento', case when c.consent_given then 'vigente' else 'sin consentimiento' end,
          'fuente', ch.name,
          'registro', to_char(c.created_at at time zone 'America/Costa_Rica', 'YYYY-MM-DD')) as row
        from public.candidates c left join public.intake_channels ch on ch.id = c.intake_channel_id
        where c.status <> 'fusionado' and c.created_at >= p.v_from and c.created_at < p.v_to
        order by c.created_at
        limit v_limit + 1) x;
      v_cols := '["nombre","provincia","canton","ocupacion","experiencia","ingles","perfiles","estado","consentimiento","fuente","registro"]';
    else
      raise exception 'Conjunto de datos no válido' using errcode = '22023';
  end case;

  v_count := coalesce(jsonb_array_length(v_rows), 0);
  if v_count > v_limit then
    raise exception 'La exportación supera el límite de % filas: reduzca el período o filtre por cliente', v_limit using errcode = '23514';
  end if;
  -- Registro ANTES de entregar los datos
  insert into public.access_logs (action, resource, record_id, reason, item_count, actor_id)
  values ('exportar', 'exportacion_' || p_dataset, p_client, left(btrim(p_reason), 300), v_count, auth.uid());
  return jsonb_build_object('columns', v_cols, 'rows', coalesce(v_rows, '[]'::jsonb), 'count', v_count);
end;
$$;

-- Permisos
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.analytics_summary(date, date, uuid)', 'public.analytics_funnel(date, date, uuid)', 'public.analytics_stage_times(date, date, uuid)',
    'public.analytics_sources(date, date, uuid)', 'public.analytics_recruiters(date, date, uuid)', 'public.analytics_clients(date, date)',
    'public.export_dataset(text, text, date, date, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
