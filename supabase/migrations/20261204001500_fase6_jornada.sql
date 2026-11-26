-- =====================================================================
-- TPC Recruitment Hub — Fase 6: productividad y seguimiento («Mi jornada»).
-- Migración 1500 (incremental y compatible).
--   1. Tareas y recordatorios (seguimiento de clientes, llamadas, otros),
--      ligados opcionalmente a cliente, requisición, vacante o postulación.
--   2. Suscripción de calendario por usuario (enlace secreto revocable):
--      solo entrevistas y tareas propias, SIN datos personales de candidatos.
--   3. Indicadores de gestión y productividad por responsable.
-- Verificación: supabase/verification/1500_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tareas y recordatorios
-- ---------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 3 and 200),
  kind            text not null default 'recordatorio' check (kind in ('seguimiento_cliente', 'llamada', 'recordatorio', 'otro')),
  due_at          timestamptz not null,
  status          text not null default 'pendiente' check (status in ('pendiente', 'hecha', 'cancelada')),
  notes           text check (notes is null or char_length(notes) <= 1000),
  assigned_to     uuid not null references public.profiles (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete cascade,
  requisition_id  uuid references public.requisitions (id) on delete cascade,
  vacancy_id      uuid references public.vacancies (id) on delete cascade,
  application_id  uuid references public.applications (id) on delete cascade,
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assigned_to, status, due_at);
create index tasks_client_idx on public.tasks (client_id) where client_id is not null;

create or replace function private.tasks_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Solo coordinación y administración asignan tareas a otras personas.
  if new.assigned_to is distinct from auth.uid() and auth.uid() is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not private.has_any_role('admin', 'coordinador') then
    raise exception 'Solo coordinación o administración asignan tareas a otras personas' using errcode = '42501';
  end if;
  if new.assigned_to is distinct from coalesce(case when tg_op = 'UPDATE' then old.assigned_to end, new.assigned_to)
     or tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.id = new.assigned_to and p.is_active and p.role <> 'consulta') then
      raise exception 'La tarea solo se asigna a personal operativo activo' using errcode = '23514';
    end if;
  end if;
  if new.status = 'hecha' and (tg_op = 'INSERT' or old.status <> 'hecha') then
    new.completed_at := now();
  elsif new.status <> 'hecha' then
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger tasks_rules before insert or update on public.tasks for each row execute function private.tasks_rules();
create trigger tasks_set_created_by before insert on public.tasks for each row execute function private.set_created_by();

alter table public.tasks enable row level security;
alter table public.tasks force row level security;
revoke all on public.tasks from anon, authenticated;
grant select, insert, update on public.tasks to authenticated;
create policy "tasks: leer" on public.tasks for select to authenticated
  using (private.is_operational() and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or (select private.has_any_role('admin', 'coordinador'))));
create policy "tasks: crear" on public.tasks for insert to authenticated
  with check (private.is_operational());
create policy "tasks: editar" on public.tasks for update to authenticated
  using (private.is_operational() and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or (select private.has_any_role('admin', 'coordinador'))))
  with check (private.is_operational());
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function private.write_audit_log();

-- ---------------------------------------------------------------------
-- 2) Suscripción de calendario (iCalendar)
-- ---------------------------------------------------------------------
create table private.calendar_tokens (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  last_used   timestamptz
);
revoke all on private.calendar_tokens from public, anon, authenticated;

-- Crea o renueva el enlace secreto del usuario (el anterior deja de funcionar). Devuelve el token una sola vez.
create or replace function public.rotate_calendar_token()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not private.is_operational() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into private.calendar_tokens (user_id, token_hash) values (auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used = null;
  return v_token;
end;
$$;

create or replace function public.revoke_calendar_token()
returns void language sql security definer set search_path = '' as $$
  delete from private.calendar_tokens where user_id = auth.uid()
$$;

create or replace function public.calendar_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('active', exists (select 1 from private.calendar_tokens where user_id = auth.uid()),
                            'last_used', (select last_used from private.calendar_tokens where user_id = auth.uid()))
$$;

-- Eventos del calendario para el dueño del token. Sin nombres de candidatos ni datos de contacto:
-- solo el código de la vacante, la modalidad y el lugar o enlace de la reunión.
create or replace function public.calendar_feed(p_token text)
returns table (uid text, starts_at timestamptz, ends_at timestamptz, summary text, location text, kind text, ref_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select t.user_id into v_user from private.calendar_tokens t
  join public.profiles p on p.id = t.user_id and p.is_active and p.role <> 'consulta'
  where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null then
    return;
  end if;
  update private.calendar_tokens set last_used = now() where user_id = v_user;
  return query
    select 'entrevista-' || i.id::text, i.scheduled_at, i.scheduled_at + make_interval(mins => i.duration_min),
           'Entrevista ' || case i.kind when 'telefonica' then 'telefónica' when 'cliente' then 'con el cliente' else i.kind end || ' · ' || v.code,
           i.location, 'entrevista', a.id
    from public.interviews i
    join public.applications a on a.id = i.application_id
    join public.vacancies v on v.id = a.vacancy_id
    where i.interviewer_id = v_user and i.status = 'programada' and i.scheduled_at > now() - interval '30 days'
    union all
    select 'tarea-' || k.id::text, k.due_at, k.due_at + interval '30 minutes', 'Tarea: ' || k.title, null, 'tarea', k.id
    from public.tasks k
    where k.assigned_to = v_user and k.status = 'pendiente' and k.due_at > now() - interval '30 days'
    order by 2
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Indicadores de gestión y productividad
-- ---------------------------------------------------------------------
-- Admin y coordinación: todo el equipo. Reclutador: solo sus propios indicadores.
create or replace function public.productivity_indicators(p_from date, p_to date)
returns table (user_id uuid, full_name text, applications_created integer, stage_moves integer, interviews_done integer,
               reports_finalized integer, hires integer, avg_days_to_hire numeric, tasks_done integer, tasks_overdue integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := (coalesce(p_from, (now() at time zone 'America/Costa_Rica')::date - 30)::timestamp at time zone 'America/Costa_Rica');
  v_to timestamptz := ((coalesce(p_to, (now() at time zone 'America/Costa_Rica')::date) + 1)::timestamp at time zone 'America/Costa_Rica');
  v_all boolean := private.has_any_role('admin', 'coordinador');
begin
  if not private.is_operational() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_to - v_from > interval '370 days' or v_to <= v_from then
    raise exception 'Rango de fechas no válido (máximo un año)' using errcode = '22023';
  end if;
  return query
    select p.id, p.full_name,
      (select count(*)::integer from public.application_events e where e.actor_id = p.id and e.event_type = 'creada' and e.created_at >= v_from and e.created_at < v_to),
      (select count(*)::integer from public.application_events e where e.actor_id = p.id and e.event_type = 'cambio_etapa' and e.created_at >= v_from and e.created_at < v_to),
      (select count(*)::integer from public.interviews i where i.interviewer_id = p.id and i.status = 'realizada' and i.completed_at >= v_from and i.completed_at < v_to),
      (select count(*)::integer from public.executive_reports r where r.finalized_by = p.id and r.finalized_at >= v_from and r.finalized_at < v_to),
      (select count(*)::integer from public.applications a where a.recruiter_id = p.id and a.hired_at >= v_from and a.hired_at < v_to),
      (select round(avg(extract(epoch from (a.hired_at - a.applied_at)) / 86400)::numeric, 1)
         from public.applications a where a.recruiter_id = p.id and a.hired_at >= v_from and a.hired_at < v_to),
      (select count(*)::integer from public.tasks k where k.assigned_to = p.id and k.status = 'hecha' and k.completed_at >= v_from and k.completed_at < v_to),
      (select count(*)::integer from public.tasks k where k.assigned_to = p.id and k.status = 'pendiente' and k.due_at < now())
    from public.profiles p
    where p.is_active and p.role in ('admin', 'coordinador', 'reclutador')
      and (v_all or p.id = auth.uid())
    order by p.full_name;
end;
$$;

-- Permisos de funciones
revoke all on function public.rotate_calendar_token() from public, anon;
grant execute on function public.rotate_calendar_token() to authenticated;
revoke all on function public.revoke_calendar_token() from public, anon;
grant execute on function public.revoke_calendar_token() to authenticated;
revoke all on function public.calendar_status() from public, anon;
grant execute on function public.calendar_status() to authenticated;
-- El feed lo consulta la aplicación sin sesión (las aplicaciones de calendario no inician sesión): solo con el token.
revoke all on function public.calendar_feed(text) from public, authenticated;
grant execute on function public.calendar_feed(text) to anon;
revoke all on function public.productivity_indicators(date, date) from public, anon;
grant execute on function public.productivity_indicators(date, date) to authenticated;
revoke all on function private.tasks_rules() from public, anon, authenticated;
