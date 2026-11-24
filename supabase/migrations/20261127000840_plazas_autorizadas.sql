-- =====================================================================
-- TPC Recruitment Hub — Migración 0840: plazas autorizadas por requisición.
--
--   · Plazas comprometidas de una requisición = plazas de sus vacantes
--     publicadas (abierta, pausada, cubierta) + plazas cubiertas de las
--     cerradas. Las vacantes en borrador no comprometen plazas.
--   · No se puede publicar, reabrir ni ampliar una vacante si las plazas
--     comprometidas superarían las autorizadas en la requisición.
--   · No se pueden reducir las plazas autorizadas por debajo de las comprometidas.
--   · Duplicar vacantes en borrador sigue permitido.
--
-- Incremental: reemplaza la función private.vacancy_rules (0820) con las
-- mismas reglas más la validación de plazas. No modifica datos existentes;
-- la validación solo se aplica cuando una vacante aumenta sus plazas comprometidas.
-- Verificación: supabase/verification/0840_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================

-- 1) Plazas que compromete una vacante según su estado
create or replace function private.vacancy_committed_openings(p_status public.vacancy_status, p_openings integer, p_filled integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status in ('abierta', 'pausada', 'cubierta') then coalesce(p_openings, 0)
    when p_status = 'cerrada' then coalesce(p_filled, 0)
    else 0
  end
$$;

-- 2) Plazas comprometidas de una requisición (excluyendo, opcionalmente, una vacante)
create or replace function private.requisition_committed_openings(p_requisition_id uuid, p_exclude_vacancy uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(private.vacancy_committed_openings(v.status, v.openings, v.filled_count)), 0)::integer
  from public.vacancies v
  where v.requisition_id = p_requisition_id
    and (p_exclude_vacancy is null or v.id <> p_exclude_vacancy)
$$;

-- 3) Reglas de las vacantes (0820) + validación de plazas autorizadas
create or replace function private.vacancy_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req_status public.requisition_status;
  v_authorized integer;
  v_new_committed integer;
  v_old_committed integer := 0;
  v_others integer;
begin
  -- Bloquea la requisición: serializa publicaciones simultáneas de sus vacantes.
  select r.status, r.positions_count into v_req_status, v_authorized
  from public.requisitions r where r.id = new.requisition_id
  for update;

  if tg_op = 'UPDATE' then
    if new.requisition_id <> old.requisition_id then
      raise exception 'Una vacante no puede cambiar de requisición' using errcode = '23514';
    end if;
    -- Mínimo privilegio: el reclutador asignado solo actualiza estado y plazas cubiertas.
    if auth.uid() is not null and not private.has_any_role('admin', 'coordinador')
       and (to_jsonb(new) - array['status', 'filled_count', 'updated_at', 'published_at'])
           is distinct from (to_jsonb(old) - array['status', 'filled_count', 'updated_at', 'published_at']) then
      raise exception 'Solo administración o coordinación puede modificar los datos de la vacante' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if v_req_status is null or v_req_status not in ('aprobada', 'en_proceso') then
      raise exception 'Solo se pueden crear vacantes de requisiciones aprobadas o en proceso' using errcode = '23514';
    end if;
    new.filled_count := coalesce(new.filled_count, 0);
  end if;

  -- Fecha de publicación automática la primera vez que se abre
  if new.status = 'abierta' and new.published_at is null then
    new.published_at := now();
  end if;

  -- Plazas cubiertas: estado automático
  if new.filled_count >= new.openings and new.status in ('abierta', 'pausada') then
    new.status := 'cubierta';
  elsif tg_op = 'UPDATE' and old.status = 'cubierta' and new.status = 'cubierta' and new.filled_count < new.openings then
    new.status := 'abierta';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'borrador' and new.status = 'borrador' then
    raise exception 'Una vacante publicada no puede volver a borrador' using errcode = '23514';
  end if;

  -- Plazas autorizadas: solo se valida cuando la vacante compromete más plazas que antes
  v_new_committed := private.vacancy_committed_openings(new.status, new.openings, new.filled_count);
  if tg_op = 'UPDATE' then
    v_old_committed := private.vacancy_committed_openings(old.status, old.openings, old.filled_count);
  end if;
  if v_new_committed > v_old_committed then
    v_others := private.requisition_committed_openings(new.requisition_id, new.id);
    if v_others + v_new_committed > v_authorized then
      raise exception 'Plazas insuficientes en la requisición: autorizadas %, ya comprometidas en otras vacantes %, esta vacante requiere %. Ajuste las plazas de la vacante o amplíe la requisición.',
        v_authorized, v_others, v_new_committed
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- 4) Las plazas autorizadas no pueden quedar por debajo de las comprometidas
create or replace function private.requisition_positions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_committed integer;
begin
  if new.positions_count < old.positions_count then
    v_committed := private.requisition_committed_openings(new.id, null);
    if new.positions_count < v_committed then
      raise exception 'Plazas autorizadas insuficientes: las vacantes publicadas de esta requisición ya comprometen % plazas.', v_committed
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger requisitions_positions_guard
  before update of positions_count on public.requisitions
  for each row execute function private.requisition_positions_guard();

-- Solo las usan los triggers (SECURITY DEFINER): no invocables por usuarios.
revoke all on function private.vacancy_committed_openings(public.vacancy_status, integer, integer) from public, authenticated;
revoke all on function private.requisition_committed_openings(uuid, uuid) from public, authenticated;
revoke all on function private.vacancy_rules() from public, authenticated;
revoke all on function private.requisition_positions_guard() from public, authenticated;
