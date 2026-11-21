-- =====================================================================
-- Migración 0400: Row Level Security (RLS) y permisos por usuario
--
-- Matriz de permisos (resumen; detalle en docs/SEGURIDAD.md):
--   admin        → acceso total, gestión de usuarios y borrados.
--   coordinador  → gestiona clientes, requisiciones, vacantes, candidatos y postulaciones.
--   reclutador   → ve lo asignado a él; crea/edita candidatos propios y sus postulaciones.
--   consulta     → solo lectura (sin acceso a la bitácora).
--   anon         → sin acceso a ningún dato.
-- =====================================================================

-- Defensa en profundidad: el rol anónimo no tiene privilegios sobre tablas.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Usuarios autenticados: privilegios básicos; RLS restringe las filas.
grant select, insert, update, delete on public.clients, public.requisitions, public.vacancies,
  public.candidates, public.applications to authenticated;
grant select, update on public.profiles to authenticated;
-- Los perfiles solo se crean por el trigger de Auth y se eliminan en cascada.
revoke insert, delete on public.profiles from authenticated;
-- TRUNCATE ignora RLS: nunca debe estar disponible para usuarios de la API.
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant usage, select on sequence public.requisition_code_seq, public.vacancy_code_seq to authenticated;

-- Activar y FORZAR RLS (aplica incluso al dueño de la tabla)
alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.requisitions  enable row level security;
alter table public.vacancies     enable row level security;
alter table public.candidates    enable row level security;
alter table public.applications  enable row level security;
alter table public.profiles      force row level security;
alter table public.clients       force row level security;
alter table public.requisitions  force row level security;
alter table public.vacancies     force row level security;
alter table public.candidates    force row level security;
alter table public.applications  force row level security;

-- ------------------------------ PERFILES -----------------------------
create policy "profiles: lectura para usuarios activos"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_active_user()));

create policy "profiles: el usuario edita su propio perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admin edita cualquier perfil"
  on public.profiles for update to authenticated
  using ((select private.has_any_role('admin')))
  with check ((select private.has_any_role('admin')));

-- ------------------------------ CLIENTES -----------------------------
create policy "clients: lectura para usuarios activos"
  on public.clients for select to authenticated
  using ((select private.is_active_user()));

create policy "clients: alta por admin y coordinador"
  on public.clients for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));

create policy "clients: edición por admin y coordinador"
  on public.clients for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador')))
  with check ((select private.has_any_role('admin', 'coordinador')));

create policy "clients: borrado solo admin"
  on public.clients for delete to authenticated
  using ((select private.has_any_role('admin')));

-- ---------------------------- REQUISICIONES --------------------------
create policy "requisitions: lectura según rol y asignación"
  on public.requisitions for select to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador', 'consulta'))
    or ((select private.has_any_role('reclutador')) and private.is_assigned_to_requisition(id))
  );

create policy "requisitions: alta por admin y coordinador"
  on public.requisitions for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));

create policy "requisitions: edición por admin y coordinador"
  on public.requisitions for update to authenticated
  using ((select private.has_any_role('admin', 'coordinador')))
  with check ((select private.has_any_role('admin', 'coordinador')));

create policy "requisitions: borrado solo admin"
  on public.requisitions for delete to authenticated
  using ((select private.has_any_role('admin')));

-- ------------------------------ VACANTES -----------------------------
create policy "vacancies: lectura según rol, asignación o publicación"
  on public.vacancies for select to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador', 'consulta'))
    or ((select private.has_any_role('reclutador'))
        and (status = 'abierta' or private.is_assigned_to_vacancy(id)))
  );

create policy "vacancies: alta por admin y coordinador"
  on public.vacancies for insert to authenticated
  with check ((select private.has_any_role('admin', 'coordinador')));

create policy "vacancies: edición por admin, coordinador o reclutador asignado"
  on public.vacancies for update to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  )
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  );

create policy "vacancies: borrado solo admin"
  on public.vacancies for delete to authenticated
  using ((select private.has_any_role('admin')));

-- ----------------------------- CANDIDATOS ----------------------------
-- El banco de talento es compartido entre usuarios internos activos.
create policy "candidates: lectura para usuarios activos"
  on public.candidates for select to authenticated
  using ((select private.is_active_user()));

create policy "candidates: alta por admin, coordinador y reclutador"
  on public.candidates for insert to authenticated
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and (owner_id is null or owner_id = (select auth.uid())))
  );

create policy "candidates: edición por admin, coordinador o responsable"
  on public.candidates for update to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and (owner_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and (owner_id = (select auth.uid()) or created_by = (select auth.uid())))
  );

create policy "candidates: borrado solo admin"
  on public.candidates for delete to authenticated
  using ((select private.has_any_role('admin')));

-- ---------------------------- POSTULACIONES --------------------------
create policy "applications: lectura según rol y asignación"
  on public.applications for select to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador', 'consulta'))
    or ((select private.has_any_role('reclutador'))
        and (recruiter_id = (select auth.uid()) or private.is_assigned_to_vacancy(vacancy_id)))
  );

create policy "applications: alta por admin, coordinador o reclutador asignado"
  on public.applications for insert to authenticated
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador'))
        and recruiter_id = (select auth.uid())
        and private.is_assigned_to_vacancy(vacancy_id))
  );

create policy "applications: edición por admin, coordinador o reclutador responsable"
  on public.applications for update to authenticated
  using (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  )
  with check (
    (select private.has_any_role('admin', 'coordinador'))
    or ((select private.has_any_role('reclutador')) and recruiter_id = (select auth.uid()))
  );

create policy "applications: borrado solo admin"
  on public.applications for delete to authenticated
  using ((select private.has_any_role('admin')));
