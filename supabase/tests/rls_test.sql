-- =====================================================================
-- Pruebas automáticas de RLS y permisos por usuario (datos ficticios).
-- Ejecutar con: npm run test:db  (Postgres local + shim de Supabase)
-- Todo corre en una transacción que se revierte al final.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
\o /dev/null

create schema tests;
grant usage on schema tests to authenticated, anon;

create table tests.results (n serial, ok boolean, msg text);
grant insert, select on tests.results to authenticated, anon;
grant usage on sequence tests.results_n_seq to authenticated, anon;

create function tests.eq(actual anyelement, expected anyelement, msg text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLO: % (obtenido: %, esperado: %)', msg, actual, expected;
  end if;
  insert into tests.results (ok, msg) values (true, msg);
end $$;

-- Ejecuta SQL y espera que falle (por RLS o permisos)
create function tests.fails(stmt text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    insert into tests.results (ok, msg) values (true, msg);
    return;
  end;
  raise exception 'FALLO: se esperaba error en: % (%)', msg, stmt;
end $$;

-- Ejecuta SQL y devuelve las filas afectadas
create function tests.affected(stmt text) returns int
language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- --------------------- Usuarios ficticios ---------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@tpc-demo.test',        '{"full_name":"Admin Demo"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'coordinadora@tpc-demo.test', '{"full_name":"Coordinadora Demo"}'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'reclutador1@tpc-demo.test',  '{"full_name":"Reclutador Uno"}'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'reclutador2@tpc-demo.test',  '{"full_name":"Reclutador Dos"}'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'consulta@tpc-demo.test',     '{"full_name":"Consulta Demo"}'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'inactivo@tpc-demo.test',     '{"full_name":"Inactivo Demo"}');

select tests.eq((select count(*)::int from public.profiles), 6, 'trigger crea un perfil por usuario de Auth');
select tests.eq((select role::text from public.profiles where email = 'reclutador2@tpc-demo.test'), 'consulta', 'rol por defecto es consulta (mínimo privilegio)');

-- Asignación de roles como superusuario (equivale a service_role)
update public.profiles set role = 'admin'       where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.profiles set role = 'coordinador' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
update public.profiles set role = 'reclutador'  where id in ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004');
update public.profiles set role = 'reclutador', is_active = false where id = 'aaaaaaaa-0000-4000-8000-000000000006';

-- Reclutador 1 asignado a la requisición/vacante 1 y a una postulación
update public.requisitions set assigned_recruiter_id = 'aaaaaaaa-0000-4000-8000-000000000003' where id = '22222222-0000-4000-8000-000000000001';
update public.vacancies set recruiter_id = 'aaaaaaaa-0000-4000-8000-000000000003' where id = '33333333-0000-4000-8000-000000000001';
update public.applications set recruiter_id = 'aaaaaaaa-0000-4000-8000-000000000003' where vacancy_id = '33333333-0000-4000-8000-000000000001';

-- ============================== ANON ================================
set local role anon;
select tests.fails('select * from public.candidates', 'anon no puede leer candidatos');
select tests.fails('select * from public.clients', 'anon no puede leer clientes');
select tests.fails('select * from public.profiles', 'anon no puede leer perfiles');
select tests.fails('select * from public.dashboard_metrics', 'anon no puede leer métricas');
reset role;

-- ============================== ADMIN ===============================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);
select tests.eq((select count(*)::int from public.clients), 3, 'admin ve todos los clientes');
select tests.eq((select count(*)::int from public.requisitions), 3, 'admin ve todas las requisiciones');
select tests.eq((select count(*)::int from public.applications), 2, 'admin ve todas las postulaciones');
select tests.eq((select active_clients::int from public.dashboard_metrics), 2, 'métricas: clientes activos');
select tests.eq((select open_vacancies::int from public.dashboard_metrics), 1, 'métricas: vacantes abiertas');
select tests.eq(tests.affected($$update public.profiles set role = 'coordinador' where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$), 1, 'admin puede cambiar roles');
select tests.fails($$update public.profiles set role = 'consulta' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'admin no puede degradarse a sí mismo');
select tests.eq(tests.affected($$update public.profiles set role = 'consulta' where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$), 1, 'admin restablece rol consulta');
select tests.eq((select count(*)::int from public.audit_logs) > 0, true, 'admin puede leer la bitácora');
select tests.fails($$insert into public.audit_logs (table_name, action) values ('x', 'INSERT')$$, 'nadie inserta manualmente en la bitácora');
select tests.fails('truncate public.candidates', 'TRUNCATE no está permitido vía API');
reset role;

-- ============================ COORDINADOR ===========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);
select tests.eq(tests.affected($$insert into public.clients (name, status) values ('Cliente Ficticio Coordinación', 'prospecto')$$), 1, 'coordinador crea clientes');
select tests.eq((select created_by from public.clients where name = 'Cliente Ficticio Coordinación'), 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'created_by se asigna automáticamente');
select tests.eq(tests.affected($$insert into public.requisitions (client_id, title) values ('11111111-0000-4000-8000-000000000001', 'Requisición ficticia')$$), 1, 'coordinador crea requisiciones');
select tests.eq((select code like 'REQ-%' from public.requisitions where title = 'Requisición ficticia'), true, 'código de requisición autogenerado');
select tests.eq(tests.affected($$delete from public.clients where name = 'Cliente Ficticio Coordinación'$$), 0, 'coordinador NO puede borrar clientes');
select tests.fails($$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000002'$$, 'coordinador no puede auto-asignarse admin');
select tests.eq((select count(*)::int from public.audit_logs), 0, 'coordinador NO ve la bitácora');
reset role;

-- ============================ RECLUTADOR 1 ==========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
select tests.eq((select count(*)::int from public.requisitions), 1, 'reclutador solo ve requisiciones asignadas');
select tests.eq((select count(*)::int from public.vacancies), 1, 'reclutador ve vacantes asignadas o abiertas');
select tests.eq((select count(*)::int from public.applications), 2, 'reclutador ve postulaciones de su vacante');
select tests.eq((select count(*)::int from public.candidates), 3, 'reclutador ve el banco de talento');
select tests.fails($$insert into public.clients (name) values ('No permitido')$$, 'reclutador NO crea clientes');
select tests.fails($$insert into public.requisitions (client_id, title) values ('11111111-0000-4000-8000-000000000001', 'No permitido')$$, 'reclutador NO crea requisiciones');
select tests.eq(tests.affected($$insert into public.candidates (first_name, last_name, owner_id) values ('Fabiola', 'Ficticia Araya', 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'reclutador crea candidatos propios');
select tests.fails($$insert into public.candidates (first_name, last_name, owner_id) values ('Otro', 'Ajeno', 'aaaaaaaa-0000-4000-8000-000000000004')$$, 'reclutador NO crea candidatos a nombre de otro');
select tests.eq(tests.affected($$update public.candidates set notes = 'nota' where first_name = 'Fabiola'$$), 1, 'reclutador edita sus candidatos');
select tests.eq(tests.affected($$update public.candidates set notes = 'nota' where id = '44444444-0000-4000-8000-000000000002'$$), 0, 'reclutador NO edita candidatos ajenos');
select tests.eq(tests.affected($$insert into public.applications (vacancy_id, candidate_id, recruiter_id) values ('33333333-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'reclutador postula candidatos a su vacante');
select tests.eq(tests.affected($$update public.applications set stage = 'oferta' where candidate_id = '44444444-0000-4000-8000-000000000001'$$), 1, 'reclutador mueve etapas de sus postulaciones');
select tests.eq(tests.affected($$delete from public.applications$$), 0, 'reclutador NO borra postulaciones');
select tests.fails($$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000003'$$, 'reclutador no puede escalar privilegios');
select tests.eq(tests.affected($$update public.profiles set full_name = 'Reclutador Uno (editado)' where id = 'aaaaaaaa-0000-4000-8000-000000000003'$$), 1, 'usuario edita su nombre');
select tests.eq(tests.affected($$update public.profiles set full_name = 'X' where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$), 0, 'usuario NO edita perfiles ajenos');
select tests.fails($$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@x.test')$$, 'nadie inserta perfiles vía API');
reset role;

-- ============================ RECLUTADOR 2 ==========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);
select tests.eq((select count(*)::int from public.requisitions), 0, 'reclutador sin asignación no ve requisiciones');
select tests.eq((select count(*)::int from public.vacancies), 1, 'reclutador sin asignación solo ve vacantes abiertas');
select tests.eq((select count(*)::int from public.applications), 0, 'reclutador sin asignación no ve postulaciones ajenas');
select tests.fails($$insert into public.applications (vacancy_id, candidate_id, recruiter_id) values ('33333333-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000004')$$, 'reclutador NO postula en vacantes no asignadas');
select tests.eq(tests.affected($$update public.vacancies set status = 'cerrada'$$), 0, 'reclutador NO edita vacantes no asignadas');
reset role;

-- ============================== CONSULTA ============================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);
select tests.eq((select count(*)::int from public.requisitions), 4, 'consulta lee todas las requisiciones');
select tests.fails($$insert into public.candidates (first_name, last_name) values ('No', 'Permitido')$$, 'consulta NO crea candidatos');
select tests.eq(tests.affected($$update public.clients set notes = 'x'$$), 0, 'consulta NO edita clientes');
reset role;

-- ============================== INACTIVO ============================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000006"}', true);
select tests.eq((select count(*)::int from public.candidates), 0, 'usuario inactivo no ve candidatos');
select tests.eq((select count(*)::int from public.clients), 0, 'usuario inactivo no ve clientes');
select tests.eq((select count(*)::int from public.profiles), 1, 'usuario inactivo solo ve su propio perfil');
reset role;

-- ======================= SIN SESIÓN (JWT vacío) =====================
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select tests.eq((select count(*)::int from public.candidates), 0, 'sin sub en JWT no hay datos');
reset role;

-- ============================= AUDITORÍA ============================
select tests.eq(
  (select changed_fields from public.audit_logs where table_name = 'candidates' and action = 'UPDATE' order by id desc limit 1),
  array['notes']::text[], 'bitácora guarda solo nombres de campos modificados');
select tests.eq(
  (select actor_id from public.audit_logs where table_name = 'applications' and action = 'UPDATE' order by id desc limit 1),
  'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'bitácora registra el actor');

\o
select format('%s pruebas RLS superadas', count(*)) as resultado from tests.results where ok;
rollback;
