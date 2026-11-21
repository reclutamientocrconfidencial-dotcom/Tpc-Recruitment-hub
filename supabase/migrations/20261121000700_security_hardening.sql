-- =====================================================================
-- Migración 0700: endurecimiento de seguridad (revisión de la PR #1)
-- Se agrega como migración nueva para que aplique también en proyectos
-- donde ya se ejecutaron las migraciones 0100–0600.
-- =====================================================================

-- 1) created_by no puede falsificarse: siempre es el usuario autenticado y
--    es inmutable. Solo operaciones administrativas sin JWT (service_role /
--    SQL Editor) pueden fijarlo explícitamente.
create or replace function private.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.keep_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'requisitions', 'vacancies', 'candidates', 'applications'] loop
    execute format(
      'create trigger %1$s_keep_created_by before update on public.%1$I for each row execute function private.keep_created_by()', t);
  end loop;
end;
$$;

-- 2) Un reclutador no puede mover su postulación a una vacante que no tiene asignada.
drop policy "applications: edición por admin, coordinador o reclutador responsable" on public.applications;
-- (PostgreSQL trunca nombres >63 bytes; se elimina también la variante truncada si existe)
drop policy if exists "applications: edición por admin, coordinador o reclutador resp" on public.applications;

create policy "applications: editar (admin, coord, reclutador)"
  on public.applications for update to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  )
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and recruiter_id = (select auth.uid())
        and private.is_assigned_to_vacancy(vacancy_id))
  );

-- 3) Un reclutador asignado a una vacante no puede moverla a otra requisición
--    ni reasignarla: requisition_id debe seguir siendo una requisición asignada.
drop policy if exists "vacancies: edición por admin, coordinador o reclutador asignad" on public.vacancies;
drop policy if exists "vacancies: edición por admin, coordinador o reclutador asignado" on public.vacancies;

create policy "vacancies: editar (admin, coord, reclutador)"
  on public.vacancies for update to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  )
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and recruiter_id = (select auth.uid())
        and private.is_assigned_to_requisition(requisition_id))
  );

-- 4) La vista de métricas es de solo lectura.
revoke all on public.dashboard_metrics from authenticated, anon;
grant select on public.dashboard_metrics to authenticated;

-- 5) Las funciones de trigger no deben poder invocarse directamente.
revoke all on function private.handle_new_user() from public, authenticated;
revoke all on function private.protect_profile_privileges() from public, authenticated;
revoke all on function private.write_audit_log() from public, authenticated;
revoke all on function private.set_updated_at() from public, authenticated;
revoke all on function private.set_created_by() from public, authenticated;
revoke all on function private.keep_created_by() from public, authenticated;
revoke all on function private.touch_stage_changed_at() from public, authenticated;
