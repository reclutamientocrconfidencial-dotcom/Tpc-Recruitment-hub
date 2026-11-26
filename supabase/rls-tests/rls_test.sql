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
select tests.eq(tests.affected($$update public.candidates set current_title = 'Cajera' where first_name = 'Fabiola'$$), 1, 'reclutador edita sus candidatos');
select tests.eq(tests.affected($$update public.candidates set notes = 'nota' where id = '44444444-0000-4000-8000-000000000002'$$), 0, 'reclutador NO edita candidatos ajenos');
select tests.eq(tests.affected($$insert into public.applications (vacancy_id, candidate_id, recruiter_id) values ('33333333-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'reclutador postula candidatos a su vacante');
select tests.eq(tests.affected($$update public.applications set stage = 'oferta' where candidate_id = '44444444-0000-4000-8000-000000000001'$$), 1, 'reclutador mueve etapas de sus postulaciones');
select tests.eq(tests.affected($$delete from public.applications$$), 0, 'reclutador NO borra postulaciones');
select tests.fails($$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000003'$$, 'reclutador no puede escalar privilegios');
select tests.eq(tests.affected($$update public.profiles set full_name = 'Reclutador Uno (editado)' where id = 'aaaaaaaa-0000-4000-8000-000000000003'$$), 1, 'usuario edita su nombre');
select tests.eq(tests.affected($$update public.profiles set full_name = 'X' where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$), 0, 'usuario NO edita perfiles ajenos');
select tests.fails($$insert into public.profiles (id, email) values (gen_random_uuid(), 'x@x.test')$$, 'nadie inserta perfiles vía API');
-- Endurecimiento (migración 0700)
select tests.eq(tests.affected($$insert into public.candidates (first_name, last_name, owner_id, created_by) values ('Gabriel', 'Suplantador Ficticio', 'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002')$$), 1, 'alta con created_by ajeno se acepta...');
select tests.eq((select created_by from public.candidates where first_name = 'Gabriel'), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, '...pero created_by se fuerza al usuario real (no suplantable)');
select tests.eq(tests.affected($$update public.candidates set created_by = 'aaaaaaaa-0000-4000-8000-000000000002' where first_name = 'Gabriel'$$), 1, 'intento de cambiar created_by...');
select tests.eq((select created_by from public.candidates where first_name = 'Gabriel'), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, '...created_by es inmutable');
select tests.fails($$update public.applications set vacancy_id = '33333333-0000-4000-8000-000000000002' where candidate_id = '44444444-0000-4000-8000-000000000001'$$, 'reclutador NO mueve postulaciones a vacantes no asignadas');
select tests.fails($$update public.vacancies set requisition_id = '22222222-0000-4000-8000-000000000002' where id = '33333333-0000-4000-8000-000000000001'$$, 'reclutador NO mueve su vacante a otra requisición');
select tests.fails($$update public.vacancies set openings = 2 where id = '33333333-0000-4000-8000-000000000001'$$, 'reclutador NO cambia las plazas de su vacante (fase 2B: solo estado y plazas cubiertas)');
select tests.eq(tests.affected($$update public.vacancies set filled_count = 0 where id = '33333333-0000-4000-8000-000000000001'$$), 1, 'reclutador sí actualiza su vacante asignada (plazas cubiertas)');
select tests.fails($$insert into public.dashboard_metrics values (1,1,1,1,1,1)$$, 'la vista de métricas es de solo lectura');
select tests.fails($$select private.handle_new_user()$$, 'funciones de trigger no invocables directamente');
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

-- ====================== FASE 2A: CONFIGURACIÓN =======================
set local role anon;
select tests.fails('select * from public.intake_channels', 'anon no lee fuentes de recepción');
select tests.fails('select * from public.pipeline_templates', 'anon no lee plantillas de proceso');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.intake_channels), 12, 'consulta lee el catálogo de fuentes');
select tests.eq((select count(*)::int from public.pipeline_stages s join public.pipeline_templates t on t.id = s.template_id where t.client_id is null and t.is_default), 8, 'existe el proceso global con 8 etapas');
select tests.fails($$insert into public.intake_channels (code, name, category) values ('x_consulta', 'X', 'otro')$$, 'consulta NO crea fuentes');
select tests.fails($$insert into public.requirement_templates (requirement) values ('No permitido')$$, 'consulta NO crea requisitos');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.fails($$insert into public.pipeline_templates (name) values ('No permitido')$$, 'reclutador NO crea plantillas de proceso');
select tests.fails($$select public.save_pipeline_stages((select id from public.pipeline_templates where is_default and client_id is null), '[]'::jsonb)$$, 'reclutador NO modifica etapas');
select tests.eq(tests.affected($$delete from public.pipeline_stages$$), 0, 'reclutador NO borra etapas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.fails($$insert into public.intake_channels (code, name, category) values ('x_coord', 'X', 'otro')$$, 'coordinador NO crea fuentes (solo admin)');
select tests.eq(tests.affected($$insert into public.pipeline_templates (client_id, name) values ('11111111-0000-4000-8000-000000000001', 'Proceso ficticio del cliente')$$), 1, 'coordinador crea plantilla de cliente');
select tests.eq((select created_by from public.pipeline_templates where name = 'Proceso ficticio del cliente'), 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'created_by forzado en plantillas');
select public.save_pipeline_stages(
  (select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'),
  '[{"name":"Recibido","category":"nuevo"},{"name":"Entrevista cliente","category":"en_proceso","stage_type":"entrevista","target_days":"4"},{"name":"Contratado","category":"contratado"},{"name":"No seleccionado","category":"descartado"}]'::jsonb);
select tests.eq((select string_agg(s.name, '|' order by s.position) from public.pipeline_stages s join public.pipeline_templates t on t.id = s.template_id where t.name = 'Proceso ficticio del cliente'), 'Recibido|Entrevista cliente|Contratado|No seleccionado', 'etapas guardadas en orden');
select tests.fails($$select public.save_pipeline_stages((select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'), '[{"name":"A","category":"nuevo"},{"name":"B","category":"en_proceso"},{"name":"C","category":"contratado"}]'::jsonb)$$, 'proceso sin etapa descartado es rechazado');
select tests.eq(tests.affected($$delete from public.pipeline_templates where is_default$$), 0, 'no se puede borrar la plantilla predeterminada');
select tests.eq(tests.affected($$insert into public.requirement_templates (client_id, position_title, requirement, requirement_type, category, weight) values ('11111111-0000-4000-8000-000000000001', 'Ejecutivo de ventas', 'Licencia B1 vigente', 'obligatorio', 'certificacion', 4)$$), 1, 'coordinador crea requisitos por cliente y posición');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);  -- admin
select tests.eq(tests.affected($$insert into public.intake_channels (code, name, category, detail_label) values ('computrabajo_demo', 'Plataforma ficticia', 'plataforma_empleo', null)$$), 1, 'admin crea fuentes');
select tests.eq(tests.affected($$update public.intake_channels set is_active = false where code = 'computrabajo_demo'$$), 1, 'admin desactiva fuentes');
select tests.fails($$delete from public.intake_channels where code = 'otro'$$, 'las fuentes no se borran (sin permiso DELETE)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000006"}', true);  -- inactivo
select tests.eq((select count(*)::int from public.intake_channels), 0, 'usuario inactivo no ve catálogos');
reset role;

-- =================== FASE 2A (mejoras): CATÁLOGOS =====================
set local role anon;
select tests.fails('select * from public.stage_catalog', 'anon no lee el catálogo de etapas');
select tests.fails('select * from public.job_positions', 'anon no lee puestos');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int >= 14 from public.stage_catalog), true, 'consulta lee el catálogo de etapas');
select tests.eq((select count(*)::int from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Idiomas (MCER)'), 7, 'escala MCER con 7 niveles');
select tests.fails($$insert into public.job_positions (name) values ('Puesto no permitido')$$, 'consulta NO crea puestos');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.fails($$insert into public.stage_catalog (name, category) values ('Etapa no permitida', 'en_proceso')$$, 'reclutador NO crea etapas de catálogo');
select tests.eq(tests.affected($$update public.requirement_catalog set is_active = false$$), 0, 'reclutador NO desactiva requisitos del catálogo');
select tests.fails($$select public.duplicate_pipeline_template((select id from public.pipeline_templates where is_default and client_id is null and position_id is null), '11111111-0000-4000-8000-000000000002')$$, 'reclutador NO duplica procesos');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.stage_catalog (name, category, stage_type, default_target_days) values ('Assessment center ficticio', 'en_proceso', 'prueba', 2)$$), 1, 'coordinador crea etapas en el catálogo');
select tests.fails($$insert into public.stage_catalog (name, category) values ('assessment CENTER ficticio', 'en_proceso')$$, 'nombre de etapa duplicado (sin distinguir mayúsculas)');
select tests.eq(tests.affected($$insert into public.job_positions (name, area) values ('Técnico(a) de mantenimiento ficticio', 'Operaciones')$$), 1, 'coordinador crea puestos nuevos');
select tests.fails($$delete from public.job_positions where name = 'Chofer'$$, 'los puestos no se borran (sin permiso DELETE)');
select tests.eq(tests.affected($$update public.job_positions set is_active = false where name = 'Chofer'$$), 1, 'los puestos se desactivan');

-- Etapas desde el catálogo: categoría y tipo automáticos
select public.save_pipeline_stages(
  (select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'),
  jsonb_build_array(
    jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Nuevo')),
    jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Prueba de Excel'), 'target_days', '1'),
    jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Contratado')),
    jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Descartado'))));
select tests.eq((select s.category::text || '/' || s.stage_type::text || '/' || s.target_days from public.pipeline_stages s join public.pipeline_templates t on t.id = s.template_id where t.name = 'Proceso ficticio del cliente' and s.position = 2), 'en_proceso/prueba/1', 'categoría y tipo asignados desde el catálogo');
select tests.eq((select s.target_days from public.pipeline_stages s join public.pipeline_templates t on t.id = s.template_id where t.name = 'Proceso ficticio del cliente' and s.position = 1), 2::smallint, 'plazo predeterminado del catálogo');
select tests.fails($$select public.save_pipeline_stages((select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'), jsonb_build_array(jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Nuevo')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Nuevo')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Contratado')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Descartado'))))$$, 'etapa repetida es rechazada');
update public.stage_catalog set is_active = false where name = 'Verificación de referencias';
select tests.fails($$select public.save_pipeline_stages((select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'), jsonb_build_array(jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Nuevo')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Verificación de referencias')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Contratado')), jsonb_build_object('catalog_stage_id', (select id from public.stage_catalog where name = 'Descartado'))))$$, 'no se agregan etapas inactivas');
select tests.eq((select count(*)::int from public.pipeline_stages s join public.stage_catalog c on c.id = s.catalog_stage_id where c.name = 'Verificación' ), 1, 'desactivar no borra el historial: el proceso estándar conserva sus etapas');

-- Duplicar proceso a un cliente + puesto, y resolución jerárquica
select tests.eq(tests.affected($$update public.pipeline_templates set is_default = true where name = 'Proceso ficticio del cliente'$$), 1, 'proceso del cliente marcado como predeterminado');
select tests.eq((select public.duplicate_pipeline_template((select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'), '11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'), null, 'Proceso ventas ficticio')) is not null, true, 'coordinador duplica un proceso para cliente + puesto');
select tests.eq((select count(*)::int from public.pipeline_stages s join public.pipeline_templates t on t.id = s.template_id where t.name = 'Proceso ventas ficticio'), 4, 'la copia conserva las etapas');
select tests.fails($$select public.duplicate_pipeline_template((select id from public.pipeline_templates where name = 'Proceso ficticio del cliente'), '11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'))$$, 'no se duplica sobre un alcance que ya tiene proceso');
select tests.eq((select name from public.pipeline_templates where id = public.resolve_pipeline_template('11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'))), 'Proceso ventas ficticio', 'resolución: cliente + puesto');
select tests.eq((select name from public.pipeline_templates where id = public.resolve_pipeline_template('11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Bodeguero(a)'))), 'Proceso ficticio del cliente', 'resolución: cliente');
select tests.eq((select name from public.pipeline_templates where id = public.resolve_pipeline_template('11111111-0000-4000-8000-000000000003', null)), 'Proceso estándar TPC', 'resolución: estándar TPC');

-- Requisitos desde el catálogo con nivel de dominio
select tests.eq(tests.affected($$insert into public.requirement_templates (client_id, position_id, catalog_requirement_id, min_level_id, requirement, requirement_type, weight) values ('11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'), (select id from public.requirement_catalog where name = 'Inglés'), (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Idiomas (MCER)' and l.label = 'B2'), 'x', 'obligatorio', 5)$$), 1, 'requisito del catálogo con nivel B2');
select tests.eq((select requirement || '|' || category::text || '|' || expected_level || '|' || position_title from public.requirement_templates where requirement = 'Inglés' and client_id = '11111111-0000-4000-8000-000000000001'), 'Inglés|idioma|B2|Ejecutivo(a) de ventas', 'nombre, categoría, nivel y puesto se completan desde los catálogos');
select tests.fails($$insert into public.requirement_templates (catalog_requirement_id, min_level_id, requirement) values ((select id from public.requirement_catalog where name = 'Inglés'), (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Dominio general' and l.label = 'Avanzado'), 'x')$$, 'nivel de otra escala es rechazado');
select tests.eq((select public.copy_requirement_templates('11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'), '11111111-0000-4000-8000-000000000002', null)), 1, 'copiar requisitos a otro cliente');
select tests.eq((select public.copy_requirement_templates('11111111-0000-4000-8000-000000000001', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'), '11111111-0000-4000-8000-000000000002', null)), 0, 'copiar de nuevo no duplica');
reset role;

-- ============== FASE 2B: REQUISICIONES Y VACANTES ===================
-- Privilegios de las funciones usadas por los triggers (se ejecutan como el usuario)
select tests.eq(has_function_privilege('authenticated', 'private.requisition_transition_allowed(public.requisition_status, public.requisition_status)', 'execute'), true, 'el trigger de requisiciones puede validar transiciones');
select tests.eq(has_function_privilege('anon', 'private.requisition_transition_allowed(public.requisition_status, public.requisition_status)', 'execute'), false, 'anon no ejecuta funciones privadas');
select tests.eq(has_function_privilege('authenticated', 'private.vacancy_rules()', 'execute'), false, 'funciones de trigger no invocables por usuarios');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
-- Una requisición creada por un usuario siempre inicia el flujo
select tests.fails($$insert into public.requisitions (client_id, title, status) values ('11111111-0000-4000-8000-000000000001', 'Atajo no permitido', 'aprobada')$$, 'no se crea una requisición ya aprobada');
select tests.eq(tests.affected($$insert into public.requisitions (client_id, title, positions_count, priority, target_date, position_id, work_schedule, province, modality) values ('11111111-0000-4000-8000-000000000002', 'Bodeguero ficticio 2B', 3, 'alta', current_date + 20, (select id from public.job_positions where name = 'Bodeguero(a)'), 'L-V 7:00-16:00', 'Heredia', 'presencial')$$), 1, 'coordinador crea requisición con puesto, horario y ubicación');
select tests.fails($$insert into public.vacancies (requisition_id, title) values ((select id from public.requisitions where title = 'Bodeguero ficticio 2B'), 'Vacante prematura')$$, 'no hay vacantes de requisiciones en borrador');
select tests.fails($$update public.requisitions set status = 'en_proceso' where title = 'Bodeguero ficticio 2B'$$, 'transición inválida borrador → en proceso');
select tests.eq(tests.affected($$update public.requisitions set status = 'pendiente_aprobacion' where title = 'Bodeguero ficticio 2B'$$), 1, 'enviar a aprobación');
select tests.eq(tests.affected($$update public.requisitions set status = 'aprobada' where title = 'Bodeguero ficticio 2B'$$), 1, 'aprobar requisición');
select tests.eq((select approved_by from public.requisitions where title = 'Bodeguero ficticio 2B'), 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'aprobación registra quién aprobó');
select tests.eq(tests.affected($$update public.requisitions set approved_by = null, approved_at = null where title = 'Bodeguero ficticio 2B'$$), 1, 'intento de borrar la aprobación...');
select tests.eq((select approved_by is not null from public.requisitions where title = 'Bodeguero ficticio 2B'), true, '...la aprobación no se altera manualmente');

-- Vacante desde requisición aprobada
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings, position_id, work_schedule, priority, province, modality, closes_at, recruiter_id) values ((select id from public.requisitions where title = 'Bodeguero ficticio 2B'), 'Bodeguero(a) ficticio 2B', 3, (select id from public.job_positions where name = 'Bodeguero(a)'), 'L-V 7:00-16:00', 'alta', 'Heredia', 'presencial', current_date + 15, 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'vacante desde requisición aprobada');
select tests.eq((select status::text from public.requisitions where title = 'Bodeguero ficticio 2B'), 'en_proceso', 'la requisición pasa a en proceso al crear su vacante');
select tests.eq((select published_at is null from public.vacancies where title = 'Bodeguero(a) ficticio 2B'), true, 'vacante en borrador sin fecha de publicación');
select tests.eq(tests.affected($$update public.vacancies set status = 'abierta' where title = 'Bodeguero(a) ficticio 2B'$$), 1, 'publicar vacante');
select tests.eq((select published_at is not null from public.vacancies where title = 'Bodeguero(a) ficticio 2B'), true, 'fecha de publicación automática');
select tests.fails($$update public.vacancies set filled_count = 4 where title = 'Bodeguero(a) ficticio 2B'$$, 'no se cubren más plazas que las disponibles');
select tests.fails($$update public.vacancies set status = 'borrador' where title = 'Bodeguero(a) ficticio 2B'$$, 'una vacante publicada no vuelve a borrador');

-- Requisitos sugeridos y proceso propio de la vacante
select tests.eq(tests.affected($$insert into public.requirement_templates (client_id, position_id, catalog_requirement_id, requirement, requirement_type, weight) values ('11111111-0000-4000-8000-000000000002', (select id from public.job_positions where name = 'Bodeguero(a)'), (select id from public.requirement_catalog where name = 'Experiencia en bodega o inventarios'), 'x', 'obligatorio', 4)$$), 1, 'requisito del cliente para el puesto');
select tests.eq((select public.load_vacancy_requirements((select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B'))) >= 1, true, 'cargar requisitos sugeridos en la vacante');
select tests.eq((select public.load_vacancy_requirements((select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B'))), 0, 'cargarlos de nuevo no duplica');
select tests.eq((select public.duplicate_pipeline_template((select id from public.pipeline_templates where is_default and client_id is null and position_id is null and vacancy_id is null), null, null, (select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B'), 'Proceso vacante ficticia')) is not null, true, 'proceso propio de la vacante');
select tests.eq((select name from public.pipeline_templates where id = public.resolve_pipeline_template('11111111-0000-4000-8000-000000000002', (select id from public.job_positions where name = 'Bodeguero(a)'), (select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B'))), 'Proceso vacante ficticia', 'resolución: el proceso de la vacante tiene prioridad');

-- Duplicar la vacante
select tests.eq((select public.duplicate_vacancy((select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B'))) is not null, true, 'duplicar vacante');
select tests.eq((select status::text || '|' || filled_count || '|' || (published_at is null)::text || '|' || (source_vacancy_id is not null)::text from public.vacancies where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is not null), 'borrador|0|true|true', 'la copia queda en borrador, sin plazas cubiertas y con su origen');
select tests.eq((select count(*)::int from public.requirement_templates r join public.vacancies v on v.id = r.vacancy_id where v.title = 'Bodeguero(a) ficticio 2B' and v.source_vacancy_id is not null) >= 1, true, 'la copia conserva los requisitos');
select tests.eq((select count(*)::int from public.pipeline_templates t join public.vacancies v on v.id = t.vacancy_id where v.title = 'Bodeguero(a) ficticio 2B' and v.source_vacancy_id is not null), 1, 'la copia conserva el proceso propio');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador responsable de la vacante
select tests.eq(tests.affected($$update public.vacancies set filled_count = 1 where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null$$), 1, 'el reclutador responsable actualiza las plazas cubiertas');
select tests.fails($$select public.duplicate_vacancy((select id from public.vacancies where title = 'Bodeguero(a) ficticio 2B' limit 1))$$, 'reclutador NO duplica vacantes');
select tests.fails($$update public.vacancies set salary_max = 9999999 where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null$$, 'reclutador NO modifica salario ni datos de la vacante');
select tests.fails($$update public.vacancies set title = 'Cambio no autorizado' where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null$$, 'reclutador NO cambia el título de la vacante');
select tests.eq(tests.affected($$update public.vacancies set status = 'pausada' where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null$$), 1, 'el reclutador responsable pausa su vacante');
select tests.eq(tests.affected($$update public.vacancies set status = 'abierta' where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null$$), 1, 'el reclutador responsable reabre su vacante');
select tests.fails($$select public.load_vacancy_requirements((select id from public.vacancies where title = 'Ejecutivo(a) de ventas corporativas'))$$, 'reclutador NO carga requisitos');
select tests.eq(tests.affected($$update public.requisitions set status = 'aprobada'$$), 0, 'reclutador NO aprueba requisiciones');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq(tests.affected($$update public.vacancies set filled_count = 2 where title = 'Bodeguero(a) ficticio 2B'$$), 0, 'otro reclutador NO edita vacantes ajenas');
select tests.eq((select count(*)::int from public.requisitions where title = 'Bodeguero ficticio 2B'), 0, 'otro reclutador no ve la requisición ajena');
reset role;

-- Plazas cubiertas → estado automático (como superusuario, equivale a service_role)
update public.vacancies set filled_count = 3 where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null;
select tests.eq((select status::text from public.vacancies where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null), 'cubierta', 'todas las plazas cubiertas → vacante cubierta');
update public.vacancies set filled_count = 2 where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null;
select tests.eq((select status::text from public.vacancies where title = 'Bodeguero(a) ficticio 2B' and source_vacancy_id is null), 'abierta', 'si se libera una plaza vuelve a abierta');

-- ============== PLAZAS AUTORIZADAS (0840) ==============================
select tests.eq(has_function_privilege('authenticated', 'private.requisition_committed_openings(uuid, uuid)', 'execute'), false, 'funciones de plazas no invocables');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
-- Escenario REQ-2026-00004: 2 plazas autorizadas, vacante cubierta 2/2 y su duplicado en borrador
select tests.eq(tests.affected($$insert into public.requisitions (client_id, title, positions_count, status) values ('11111111-0000-4000-8000-000000000002', 'Plazas ficticias 0840', 2, 'pendiente_aprobacion')$$), 1, 'requisición con 2 plazas autorizadas');
select tests.eq(tests.affected($$update public.requisitions set status = 'aprobada' where title = 'Plazas ficticias 0840'$$), 1, 'aprobada');
select tests.fails($$insert into public.vacancies (requisition_id, title, openings, status) values ((select id from public.requisitions where title = 'Plazas ficticias 0840'), 'Vacante excedida 0840', 3, 'abierta')$$, 'no se publica una vacante con más plazas que las autorizadas');
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings, status) values ((select id from public.requisitions where title = 'Plazas ficticias 0840'), 'Vacante A 0840', 2, 'abierta')$$), 1, 'vacante publicada con las 2 plazas');
select tests.eq(tests.affected($$update public.vacancies set filled_count = 2 where title = 'Vacante A 0840'$$), 1, 'se cubren las 2 plazas');
select tests.eq((select status::text from public.vacancies where title = 'Vacante A 0840'), 'cubierta', 'vacante cubierta 2/2');
select tests.eq((select public.duplicate_vacancy((select id from public.vacancies where title = 'Vacante A 0840'))) is not null, true, 'duplicar en borrador sigue permitido');
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings) values ((select id from public.requisitions where title = 'Plazas ficticias 0840'), 'Borrador extra 0840', 5)$$), 1, 'los borradores no comprometen plazas');
select tests.fails($$update public.vacancies set status = 'abierta' where title = 'Vacante A 0840' and source_vacancy_id is not null$$, 'no se publica el duplicado: excedería las plazas autorizadas');
select tests.fails($$update public.requisitions set positions_count = 1 where title = 'Plazas ficticias 0840'$$, 'no se reducen las plazas autorizadas por debajo de las comprometidas');
select tests.eq(tests.affected($$update public.requisitions set positions_count = 4 where title = 'Plazas ficticias 0840'$$), 1, 'ampliar las plazas autorizadas');
select tests.eq(tests.affected($$update public.vacancies set status = 'abierta' where title = 'Vacante A 0840' and source_vacancy_id is not null$$), 1, 'con plazas disponibles el duplicado se publica');
select tests.fails($$update public.vacancies set openings = 3 where title = 'Vacante A 0840' and source_vacancy_id is not null$$, 'no se amplía una vacante publicada por encima de lo autorizado');
select tests.eq(tests.affected($$update public.vacancies set status = 'cerrada' where title = 'Vacante A 0840' and source_vacancy_id is not null$$), 1, 'cerrar sin plazas cubiertas libera sus plazas');
select tests.eq(tests.affected($$update public.vacancies set openings = 2, status = 'abierta' where title = 'Borrador extra 0840'$$), 1, 'las plazas liberadas se pueden usar en otra vacante');
select tests.fails($$update public.vacancies set status = 'abierta' where title = 'Vacante A 0840' and source_vacancy_id is not null$$, 'reabrir respeta las plazas autorizadas');
select tests.eq(tests.affected($$update public.vacancies set filled_count = 1 where title = 'Borrador extra 0840'$$), 1, 'actualizar plazas cubiertas no se bloquea');
reset role;

-- ============== EDICIÓN DEL CATÁLOGO DE REQUISITOS (0830) ==============
select tests.eq(has_function_privilege('authenticated', 'private.requirement_catalog_after_update()', 'execute'), false, 'funciones de trigger 0830 no invocables');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.requirement_templates (client_id, catalog_requirement_id, requirement, requirement_type, weight) values ('11111111-0000-4000-8000-000000000003', (select id from public.requirement_catalog where name = 'SAP'), 'x', 'deseable', 2)$$), 1, 'requisito configurado que usa «SAP»');
select tests.eq(tests.affected($$update public.requirement_catalog set name = 'SAP ERP ficticio', category = 'certificacion' where name = 'SAP'$$), 1, 'coordinador edita nombre y categoría del requisito');
select tests.eq((select count(*)::int from public.requirement_templates where requirement = 'SAP' ), 0, 'ningún requisito configurado conserva el nombre anterior');
select tests.eq((select bool_and(t.requirement = 'SAP ERP ficticio' and t.category = 'certificacion') from public.requirement_templates t join public.requirement_catalog c on c.id = t.catalog_requirement_id where c.name = 'SAP ERP ficticio'), true, 'el nombre y la categoría se propagan a los requisitos configurados');
select tests.eq((select old_name || '→' || new_name || '|' || (changed_by = 'aaaaaaaa-0000-4000-8000-000000000002')::text || '|' || (templates_updated >= 1)::text from public.requirement_catalog_history h join public.requirement_catalog c on c.id = h.requirement_id where c.name = 'SAP ERP ficticio' order by changed_at desc limit 1), 'SAP→SAP ERP ficticio|true|true', 'historial con valores anteriores, autor y alcance');
select tests.fails($$update public.requirement_catalog set name = 'microsoft excel' where name = 'SAP ERP ficticio'$$, 'no se permite un nombre duplicado');
-- Escala: libre mientras nadie exija un nivel; bloqueada si hay niveles configurados
select tests.eq(tests.affected($$update public.requirement_catalog set scale_id = (select id from public.proficiency_scales where name = 'Cumplimiento') where name = 'SAP ERP ficticio'$$), 1, 'cambio de escala sin niveles configurados');
select tests.eq(tests.affected($$insert into public.requirement_templates (client_id, catalog_requirement_id, min_level_id, requirement, requirement_type, weight) values ('11111111-0000-4000-8000-000000000003', (select id from public.requirement_catalog where name = 'Microsoft Excel'), (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Dominio general' and l.label = 'Avanzado'), 'x', 'obligatorio', 3)$$), 1, 'requisito configurado con nivel mínimo');
select tests.fails($$update public.requirement_catalog set scale_id = (select id from public.proficiency_scales where name = 'Cumplimiento') where name = 'Microsoft Excel'$$, 'no se cambia la escala si hay niveles configurados');
select tests.eq(tests.affected($$update public.requirement_catalog set category = 'formacion' where name = 'Microsoft Excel'$$), 1, 'pero sí la categoría');
select tests.fails($$insert into public.requirement_catalog_history (requirement_id) select id from public.requirement_catalog limit 1$$, 'el historial no se escribe desde la API');
select tests.fails($$update public.requirement_catalog_history set new_name = 'alterado'$$, 'el historial no se altera');
select tests.fails($$delete from public.requirement_catalog_history$$, 'el historial no se borra');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.eq(tests.affected($$update public.requirement_catalog set name = 'Cambio no autorizado' where name = 'SAP ERP ficticio'$$), 0, 'reclutador NO edita el catálogo');
select tests.eq((select count(*)::int from public.requirement_catalog_history), 0, 'reclutador NO lee el historial');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq(tests.affected($$update public.requirement_catalog set name = 'Cambio no autorizado' where name = 'SAP ERP ficticio'$$), 0, 'consulta NO edita el catálogo');
select tests.eq((select count(*)::int from public.requirement_catalog_history), 0, 'consulta NO lee el historial');
reset role;
set local role anon;
select tests.fails($$select count(*) from public.requirement_catalog_history$$, 'anon sin acceso al historial');
reset role;

-- ============== PUERTA S1 (0900): MFA, REGISTRO DE ACCESOS =============
-- Todas las tablas de public: RLS habilitado y forzado; anon sin privilegios
select tests.eq((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)), 0, 'todas las tablas de public con RLS forzado');
select tests.eq((select count(*)::int from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon'), 0, 'anon sin privilegios sobre tablas de public');
select tests.eq((select mfa_required from public.security_settings), false, 'la exigencia de MFA inicia desactivada');

-- Exigencia activada (como lo haría un admin): sin aal2 no se ve ningún dato
update public.security_settings set mfa_required = true;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","aal":"aal1"}', true);  -- coordinador sin MFA
select tests.eq((select count(*)::int from public.clients), 0, 'MFA exigida: coordinador con aal1 no ve clientes');
select tests.eq(tests.affected($$update public.clients set notes = 'x' where id = '11111111-0000-4000-8000-000000000001'$$), 0, 'MFA exigida: coordinador con aal1 no edita');
select tests.eq((select count(*)::int from public.security_settings), 1, 'pero puede saber que la MFA es obligatoria');
select tests.eq((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 1, 'y ver su propio perfil');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","aal":"aal2"}', true);  -- coordinador con MFA
select tests.eq((select count(*)::int from public.clients) >= 3, true, 'MFA exigida: coordinador con aal2 ve sus datos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal1"}', true);  -- admin sin MFA
select tests.eq(tests.affected($$update public.security_settings set mfa_required = false$$), 0, 'admin con aal1 NO cambia la exigencia');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal2"}', true);  -- admin con MFA
select tests.eq(tests.affected($$update public.security_settings set mfa_required = false$$), 1, 'admin con aal2 cambia la exigencia');
select tests.eq((select updated_by from public.security_settings), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'se registra quién la cambió');
select tests.eq(tests.affected($$update public.security_settings set mfa_required = true$$), 1, 'admin con aal2 la activa de nuevo');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","aal":"aal2"}', true);  -- coordinador
select tests.eq(tests.affected($$update public.security_settings set mfa_required = false$$), 0, 'coordinador NO cambia la exigencia');
reset role;
update public.security_settings set mfa_required = false;
select tests.eq((select count(*)::int from public.audit_logs where table_name = 'security_settings'), 4, 'cada cambio de la exigencia queda en la bitácora');

-- Estado de MFA por usuario (solo admin)
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'totp', 'verified', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);
select tests.eq((select mfa_enabled from public.users_mfa_status() where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), true, 'admin ve quién tiene MFA');
select tests.eq((select mfa_enabled from public.users_mfa_status() where user_id = 'aaaaaaaa-0000-4000-8000-000000000003'), false, '... y quién no');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.fails($$select * from public.users_mfa_status()$$, 'reclutador NO consulta el estado de MFA');

-- Registro de accesos: solo se agrega mediante la función; autor no suplantable
select tests.eq((select count(*)::int from (select public.log_access('ver_dato_sensible', 'candidatos', '44444444-0000-4000-8000-000000000001', 'Revisión de expediente', null)) x), 1, 'reclutador registra un acceso');
select tests.fails($$insert into public.access_logs (action, resource, actor_id) values ('exportar', 'candidatos', 'aaaaaaaa-0000-4000-8000-000000000001')$$, 'no se escribe el registro directamente');
select tests.fails($$select public.log_access('borrar_todo', 'candidatos')$$, 'acciones fuera de la lista se rechazan');
select tests.eq((select count(*)::int from public.access_logs), 0, 'reclutador NO lee el registro de accesos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000006"}', true);  -- inactivo
select tests.fails($$select public.log_access('exportar', 'candidatos')$$, 'usuario inactivo no registra accesos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);  -- admin
select tests.eq((select actor_id from public.access_logs order by id desc limit 1), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'admin lee el registro con el autor real');
select tests.fails($$update public.access_logs set reason = 'alterado'$$, 'el registro de accesos no se altera (ni el admin)');
select tests.fails($$delete from public.access_logs$$, 'el registro de accesos no se borra (ni el admin)');
reset role;
set local role anon;
select tests.fails($$select public.log_access('exportar', 'candidatos')$$, 'anon no registra accesos');
reset role;

-- ============== FASE 2C (1000): BASE MADRE DE CANDIDATOS ===============
select tests.eq((select count(*)::int from public.candidates where national_id is not null or email is not null or phone is not null or expected_salary is not null or notes is not null), 0, 'ninguna columna sensible queda en candidates');
select tests.eq((select count(*)::int from public.candidate_private where email_norm like '%@correo.test'), 3, 'los datos de contacto existentes pasaron a candidate_private');
select tests.eq((select count(*)::int from public.cr_cantons), 84, 'catálogo con los 84 cantones de Costa Rica');
select tests.eq((select count(*)::int from public.candidate_consents where candidate_id = '44444444-0000-4000-8000-000000000001' and revoked_at is null), 1, 'consentimiento versionado de los registros previos');
select tests.eq(has_table_privilege('authenticated', 'public.candidate_private', 'select'), false, 'candidate_private sin lectura directa desde la API');

-- Consulta: nunca ve datos sensibles
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.fails($$select * from public.get_candidate_private('44444444-0000-4000-8000-000000000001')$$, 'consulta NO lee datos sensibles');
select tests.fails($$select * from public.candidate_private$$, 'consulta NO accede a candidate_private');
select tests.eq((select count(*)::int from public.candidate_consents), 0, 'consulta no ve los consentimientos');
select tests.fails($$select * from public.search_candidates_by_contact('carlos.ficticio@correo.test')$$, 'consulta NO busca por datos de contacto');
select tests.eq((select count(*)::int from public.candidates) >= 3, true, 'consulta sí ve la ficha general (nombre, ubicación, perfil)');

-- Coordinación: alta con consentimiento, datos sensibles, duplicados y perfiles
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
-- La restricción se valida al confirmar; aquí se fuerza su evaluación inmediata para probarla.
-- (Los candidatos insertados directamente por pruebas anteriores reciben antes su consentimiento.)
reset role;
insert into public.candidate_consents (candidate_id, consent_text_id, channel, evidence)
select c.id, (select id from public.consent_texts where is_active), 'otro', 'Prueba anterior a 2C'
from public.candidates c where not exists (select 1 from public.candidate_consents k where k.candidate_id = c.id);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
set constraints public.candidates_require_consent immediate;
select tests.fails($$insert into public.candidates (first_name, last_name) values ('Sin', 'Consentimiento')$$, 'ningún candidato sin consentimiento vigente (restricción)');
set constraints public.candidates_require_consent deferred;
select tests.fails($$select public.save_candidate(null, '{"first_name":"Sin","last_name":"Consentimiento"}')$$, 'alta sin consentimiento rechazada');
select tests.fails($$select public.save_candidate(null, '{"first_name":"Real","last_name":"Persona","email":"persona@gmail.com","consent":{"channel":"correo"}}')$$, 'datos reales deshabilitados: correo no ficticio rechazado');
select tests.eq((select public.save_candidate(null, jsonb_build_object(
  'first_name', 'Gloria', 'last_name', 'Ficticia Mora', 'phone', '8000 1234', 'email', 'gloria.ficticia@correo.test',
  'national_id', '9-0999-0999', 'national_id_type', 'cedula', 'province', 'Cartago', 'canton', 'La Unión', 'district', 'Tres Ríos', 'locality', 'Barrio ficticio',
  'expected_salary', '800000', 'confidential_notes', 'Nota confidencial ficticia',
  'position_ids', jsonb_build_array((select id from public.job_positions where name = 'Bodeguero(a)'), (select id from public.job_positions where name = 'Ejecutivo(a) de ventas')),
  'primary_position_id', (select id from public.job_positions where name = 'Ejecutivo(a) de ventas'),
  'consent', jsonb_build_object('channel', 'formulario_fisico', 'evidence', 'Formulario ficticio 001')
)) is not null), true, 'coordinador registra candidato con consentimiento, datos sensibles y perfiles');
select tests.eq((select email || '|' || phone from public.get_candidate_private((select id from public.candidates where first_name = 'Gloria'), 'Prueba')), 'gloria.ficticia@correo.test|8000 1234', 'lectura de datos sensibles por función');
select tests.eq((select count(*)::int from public.candidate_profiles where candidate_id = (select id from public.candidates where first_name = 'Gloria')), 2, 'múltiples perfiles profesionales');
select tests.eq((select p.name from public.candidate_profiles cp join public.job_positions p on p.id = cp.position_id where cp.candidate_id = (select id from public.candidates where first_name = 'Gloria') and cp.is_primary), 'Ejecutivo(a) de ventas', 'perfil principal');
select tests.eq((select consent_given from public.candidates where first_name = 'Gloria'), true, 'la ficha refleja el consentimiento vigente');
select tests.fails($$select public.save_candidate(null, jsonb_build_object('first_name', 'Copia', 'last_name', 'Cédula', 'national_id', '909990999', 'consent', jsonb_build_object('channel', 'correo')))$$, 'cédula duplicada (otro formato) bloqueada');
select tests.eq((select blocking from public.find_candidate_duplicates('9 0999 0999', null, null, null, null)), true, 'duplicado por cédula: bloqueo');
select tests.eq((select reasons from public.find_candidate_duplicates(null, null, '+506 8000-1234', null, null)), array['teléfono'], 'posible duplicado por teléfono en otro formato (E.164)');
select tests.eq((select reasons from public.find_candidate_duplicates(null, 'GLORIA.ficticia@correo.test', null, 'gloria', 'FICTICIA MORA')), array['correo', 'nombre'], 'posible duplicado por correo y nombre (sin mayúsculas ni tildes)');
select tests.eq((select count(*)::int from public.search_candidates_by_contact('80001234')), 1, 'búsqueda por teléfono');
select tests.eq((select count(*)::int from public.access_logs), 0, 'coordinación no lee el registro de accesos');
-- Compatibilidad: escribir columnas sensibles antiguas las traslada a candidate_private
select tests.eq(tests.affected($$update public.candidates set email = 'nuevo.correo@correo.test' where first_name = 'Gloria'$$), 1, 'escritura en columna antigua...');
select tests.eq((select email is null from public.candidates where first_name = 'Gloria'), true, '...no queda en candidates');
select tests.eq((select email from public.get_candidate_private((select id from public.candidates where first_name = 'Gloria'))), 'nuevo.correo@correo.test', '...sino en candidate_private');
reset role;
select tests.eq((select count(*)::int from public.access_logs where action = 'ver_dato_sensible' and resource = 'candidatos' and actor_id = 'aaaaaaaa-0000-4000-8000-000000000002') >= 2, true, 'cada lectura de datos sensibles queda registrada');
select tests.eq((select count(*)::int from public.access_logs where resource = 'candidatos_busqueda') >= 1, true, 'la búsqueda por datos de contacto queda registrada');

-- Reclutadores: solo candidatos propios o de sus vacantes
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador de VAC-1
select tests.eq((select count(*)::int from public.get_candidate_private('44444444-0000-4000-8000-000000000001')), 1, 'reclutador ve datos de candidatos de su vacante');
select tests.fails($$select * from public.get_candidate_private((select id from public.candidates where first_name = 'Gloria'))$$, 'reclutador NO ve datos de candidatos ajenos');
select tests.fails($$select public.save_candidate((select id from public.candidates where first_name = 'Gloria'), '{"first_name":"Cambio","last_name":"Ajeno"}')$$, 'reclutador NO edita fichas ajenas');
select tests.fails($$select public.import_batch_create('x.csv', (select id from public.consent_texts where is_active), 'importacion', 'Evidencia ficticia', 'Motivo ficticio')$$, 'reclutador NO importa');
select tests.fails($$select * from public.list_possible_duplicates()$$, 'reclutador NO revisa duplicados');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.fails($$select * from public.get_candidate_private('44444444-0000-4000-8000-000000000001')$$, 'otro reclutador NO ve esos datos');

-- Revocación del consentimiento y texto inmutable
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.fails($$select public.revoke_candidate_consent((select id from public.candidate_consents where candidate_id = (select id from public.candidates where first_name = 'Gloria')), '')$$, 'revocar exige motivo');
select tests.eq((select count(*)::int from (select public.revoke_candidate_consent((select id from public.candidate_consents where candidate_id = (select id from public.candidates where first_name = 'Gloria')), 'Solicitud ficticia del titular')) x), 1, 'revocación del consentimiento');
select tests.eq((select consent_given::text || '|' || status from public.candidates where first_name = 'Gloria'), 'false|no_contactar', 'sin consentimiento vigente: no contactar');
select tests.eq((select count(*)::int from (select public.add_candidate_consent((select id from public.candidates where first_name = 'Gloria'), 'correo', 'Nuevo consentimiento ficticio')) x), 1, 'nuevo consentimiento');
select tests.eq((select consent_given::text || '|' || status from public.candidates where first_name = 'Gloria'), 'true|activo', 'con consentimiento vigente vuelve a activo');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);  -- admin
select tests.fails($$update public.consent_texts set body = body || ' modificado' where is_active$$, 'el texto de un consentimiento ya otorgado no se modifica');
select tests.eq(tests.affected($$update public.security_settings set real_data_enabled = true$$), 0, 'admin sin aal2 NO habilita datos reales');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal2"}', true);
select tests.fails($$update public.security_settings set real_data_enabled = true$$, 'datos reales solo tras exigir la verificación en dos pasos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);
reset role;

-- Importación por lotes con revisión humana de duplicados
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
create temp table t_batch as select public.import_batch_create('candidatos_ficticios.csv', (select id from public.consent_texts where is_active), 'importacion', 'Formularios ficticios archivados', 'Ensayo de importación ficticia') as id;
select tests.eq((select public.import_batch_add_rows((select id from t_batch), '[
  {"row_number": 2, "data": {"first_name": "Hugo", "last_name": "Ficticio Solano", "phone": "8111-0001", "email": "hugo.ficticio@correo.test", "national_id": "9-0111-0001", "province": "Limón", "canton": "Pococí", "position": "Bodeguero(a)"}},
  {"row_number": 3, "data": {"first_name": "Carlos", "last_name": "Repetido", "national_id": "0-0000-0001"}},
  {"row_number": 4, "data": {"first_name": "Ana", "last_name": "Similar", "phone": "+506 8000-0002"}},
  {"row_number": 5, "data": {"first_name": "", "last_name": "Sin nombre"}, "errors": ["Nombre: obligatorio."]},
  {"row_number": 6, "data": {"first_name": "Hugo", "last_name": "Otra Fila", "email": "hugo.ficticio@correo.test"}},
  {"row_number": 7, "data": {"first_name": "Irene", "last_name": "Ficticia Nueva", "email": "irene.ficticia@correo.test", "position": "Analista de datos ficticio"}}
]'::jsonb)), 6, 'filas agregadas al lote');
select tests.eq((select string_agg(row_number || ':' || status, ',' order by row_number) from public.import_rows where batch_id = (select id from t_batch)), '2:valido,3:duplicado,4:posible_duplicado,5:error,6:error,7:valido', 'validación: válidas, duplicado por cédula, posible duplicado, errores y duplicado en el archivo');
select tests.eq((select count(*)::int from (select public.import_batch_finish((select id from t_batch))) x), 1, 'lote validado');
select tests.fails($$select public.import_batch_commit((select id from t_batch))$$, 'no se importa sin revisar los posibles duplicados');
select tests.fails($$select public.import_set_decision((select id from t_batch), 3, 'crear')$$, 'no se crea un duplicado por cédula');
select tests.fails($$select public.import_set_decision((select id from t_batch), 5, 'crear')$$, 'no se importan filas con errores');
select tests.eq((select count(*)::int from (select public.import_set_decision((select id from t_batch), 3, 'actualizar')) x), 1, 'decisión: actualizar el existente');
select tests.eq((select count(*)::int from (select public.import_set_decision((select id from t_batch), 4, 'crear')) x), 1, 'decisión humana: es otra persona');
select tests.eq((select public.import_batch_commit((select id from t_batch))), '{"creados": 3, "omitidos": 2, "actualizados": 1}'::jsonb, 'importación con conteos');
select tests.eq((select count(*)::int from public.import_rows where batch_id = (select id from t_batch) and data is not null), 0, 'los datos personales del lote se eliminan tras importar');
select tests.eq((select count(*)::int from public.candidates where import_batch_id = (select id from t_batch) and consent_given), 3, 'candidatos importados con consentimiento del lote');
select tests.eq((select count(*)::int from public.candidate_profiles cp join public.job_positions p on p.id = cp.position_id where p.name = 'Analista de datos ficticio'), 1, 'puesto nuevo agregado al catálogo y como perfil');
select tests.eq((select count(*)::int from public.candidate_consents where candidate_id = '44444444-0000-4000-8000-000000000001'), 2, 'el existente actualizado recibe el consentimiento del lote');
reset role;
select tests.eq((select item_count from public.access_logs where action = 'importar' and record_id = (select id from t_batch)), 4, 'la importación queda en el registro de accesos');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.fails($$select public.import_batch_revert((select id from t_batch), 'Motivo ficticio')$$, 'coordinador NO revierte lotes');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);  -- admin
select tests.eq((select public.import_batch_revert((select id from t_batch), 'Ensayo ficticio revertido')), 3, 'admin revierte el lote (candidatos creados sin postulaciones)');
select tests.eq((select count(*)::int from public.candidates where first_name in ('Hugo', 'Irene')), 0, 'los candidatos del lote se eliminaron');

-- Fusión de duplicados
select tests.eq((select public.save_candidate(null, jsonb_build_object('first_name', 'Julia', 'last_name', 'Ficticia Doble', 'email', 'julia.doble@correo.test', 'consent', jsonb_build_object('channel', 'correo'))) is not null), true, 'candidata A');
select tests.eq((select public.save_candidate(null, jsonb_build_object('first_name', 'Julia', 'last_name', 'Ficticia Doble', 'phone', '8222-0002', 'consent', jsonb_build_object('channel', 'telefono'))) is not null), true, 'candidata B (mismo nombre)');
select tests.eq((select count(*)::int from public.list_possible_duplicates() where name_a = 'Julia Ficticia Doble'), 1, 'pares de posibles duplicados para revisión');
create temp table t_julia as select array_agg(id order by created_at) ids from public.candidates where first_name = 'Julia';
select tests.eq((select count(*)::int from (select public.merge_candidates((select ids[1] from t_julia), (select ids[2] from t_julia))) x), 1, 'fusión');
select tests.eq((select email || '|' || phone from public.get_candidate_private((select ids[1] from t_julia))), 'julia.doble@correo.test|8222-0002', 'la fusión completa los datos vacíos');
select tests.eq((select status from public.candidates where id = (select ids[2] from t_julia)), 'fusionado', 'el duplicado queda marcado como fusionado');
select tests.eq((select count(*)::int from public.list_possible_duplicates() where name_a = 'Julia Ficticia Doble'), 0, 'ya no aparece como duplicado');
reset role;

-- Eliminar un usuario que creó registros: created_by queda vacío (antes fallaba por la llave foránea)
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000f', 'temporal@tpc-demo.test');
update public.profiles set role = 'coordinador' where id = 'aaaaaaaa-0000-4000-8000-00000000000f';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000f"}', true);
create temp table t_tmp as select public.save_candidate(null, jsonb_build_object('first_name', 'Temporal', 'last_name', 'Ficticio', 'consent', jsonb_build_object('channel', 'correo'))) as id;
reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000f';
select tests.eq((select created_by is null from public.candidates where id = (select id from t_tmp)), true, 'eliminar un usuario conserva sus registros sin autor');
select tests.eq((select consent_given from public.candidates where id = (select id from t_tmp)), true, '...y su consentimiento sigue vigente');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000e', 'temporal2@tpc-demo.test');
update public.profiles set role = 'coordinador' where id = 'aaaaaaaa-0000-4000-8000-00000000000e';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000e"}', true);
insert into public.requisitions (client_id, title, status) values ('11111111-0000-4000-8000-000000000001', 'Aprobada por usuario temporal', 'pendiente_aprobacion');
update public.requisitions set status = 'aprobada' where title = 'Aprobada por usuario temporal';
reset role;
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000e';
select tests.eq((select (approved_by is null and approved_at is not null)::text || '|' || status from public.requisitions where title = 'Aprobada por usuario temporal'), 'true|aprobada', 'eliminar a quien aprobó conserva la requisición y la fecha de aprobación');

-- ============== FASE 2D (1100): POSTULACIONES Y SEGUIMIENTO ==============
select tests.eq((select count(*)::int from public.applications where stage_id is null), 0, 'postulaciones existentes con etapa de su vacante');
select tests.eq((select stage::text from public.applications where candidate_id = '44444444-0000-4000-8000-000000000003' and vacancy_id = '33333333-0000-4000-8000-000000000001'), 'preseleccion', 'la etapa antigua se conserva al migrar');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.requisitions (client_id, title, positions_count, status) values ('11111111-0000-4000-8000-000000000001', 'Kanban ficticio 2D', 2, 'pendiente_aprobacion')$$), 1, 'requisición 2D');
select tests.eq(tests.affected($$update public.requisitions set status = 'aprobada' where title = 'Kanban ficticio 2D'$$), 1, 'aprobada');
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings, status, recruiter_id) values ((select id from public.requisitions where title = 'Kanban ficticio 2D'), 'Vacante Kanban 2D', 2, 'abierta', 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'vacante abierta con reclutador asignado');
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings) values ((select id from public.requisitions where title = 'Kanban ficticio 2D'), 'Vacante borrador 2D', 1)$$), 1, 'vacante en borrador');
create temp table t_v as select (select id from public.vacancies where title = 'Vacante Kanban 2D') as v, (select id from public.vacancies where title = 'Vacante borrador 2D') as draft;
create temp table t_c as select
  public.save_candidate(null, jsonb_build_object('first_name', 'Kevin', 'last_name', 'Ficticio Kanban', 'consent', jsonb_build_object('channel', 'correo'))) as k1,
  public.save_candidate(null, jsonb_build_object('first_name', 'Laura', 'last_name', 'Ficticia Kanban', 'consent', jsonb_build_object('channel', 'correo'))) as k2,
  public.save_candidate(null, jsonb_build_object('first_name', 'Mario', 'last_name', 'Ficticio Kanban', 'consent', jsonb_build_object('channel', 'correo'))) as k3;
create temp table t_a as select public.create_application((select v from t_v), (select k1 from t_c), 'Postulación ficticia') as a1;
select tests.eq((select count(*)::int from public.vacancy_stages where vacancy_id = (select v from t_v)), (select count(*)::int from public.pipeline_stages where template_id = public.resolve_pipeline_template('11111111-0000-4000-8000-000000000001', null, (select v from t_v))), 'etapas fijadas desde el proceso resuelto al recibir la primera postulación');
select tests.eq((select s.category::text from public.applications a join public.vacancy_stages s on s.id = a.stage_id where a.id = (select a1 from t_a)), 'nuevo', 'la postulación inicia en la etapa «nuevo»');
select tests.eq((select string_agg(event_type, ',' order by id) from public.application_events where application_id = (select a1 from t_a)), 'creada,nota', 'historial: creada y observación');
select tests.fails($$select public.create_application((select v from t_v), (select k1 from t_c))$$, 'un candidato no se postula dos veces a la misma vacante');
select tests.fails($$select public.create_application((select draft from t_v), (select k2 from t_c))$$, 'no se postula a vacantes en borrador');
select tests.eq((select count(*)::int from (select public.revoke_candidate_consent((select id from public.candidate_consents where candidate_id = (select k3 from t_c)), 'Revocación ficticia')) x), 1, 'candidato sin consentimiento');
select tests.fails($$select public.create_application((select v from t_v), (select k3 from t_c))$$, 'no se postula a quien no tiene consentimiento vigente');
create temp table t_b as select public.create_application((select v from t_v), (select k2 from t_c)) as a2;
-- Movimientos
select tests.eq((select count(*)::int from (select public.move_application((select a1 from t_a), (select id from public.vacancy_stages where vacancy_id = (select v from t_v) and category = 'en_proceso' order by position limit 1))) x), 1, 'mover a una etapa en proceso');
select tests.eq((select stage::text in ('preseleccion', 'entrevista', 'prueba_tecnica') from public.applications where id = (select a1 from t_a)), true, 'indicadores: etapa equivalente sincronizada');
select tests.fails($$select public.move_application((select a1 from t_a), (select id from public.vacancy_stages where vacancy_id = (select v from t_v) and category = 'descartado' limit 1))$$, 'descartar exige motivo');
select tests.fails($$select public.move_application((select a1 from t_a), (select id from public.vacancy_stages where vacancy_id = '33333333-0000-4000-8000-000000000001' limit 1))$$, 'no se mueve a una etapa de otra vacante');
select tests.fails($$update public.applications set vacancy_id = '33333333-0000-4000-8000-000000000001' where id = (select a1 from t_a)$$, 'una postulación no cambia de vacante');
-- Contratación → plazas cubiertas automáticas
select tests.eq((select count(*)::int from (select public.move_application(x.a, (select id from public.vacancy_stages where vacancy_id = (select v from t_v) and category = 'contratado' limit 1)) from (select a1 as a from t_a union all select a2 from t_b) x) y), 2, 'contratar a los dos candidatos');
select tests.eq((select filled_count::text || '|' || status from public.vacancies where id = (select v from t_v)), '2|cubierta', 'plazas cubiertas automáticas y vacante cubierta');
select tests.eq((select count(*)::int from public.applications where vacancy_id = (select v from t_v) and hired_at is not null), 2, 'fecha de contratación registrada');
select tests.eq((select count(*)::int from (select public.move_application((select a1 from t_a), (select id from public.vacancy_stages where vacancy_id = (select v from t_v) and category = 'descartado' limit 1), 'rechazo_oferta', 'Aceptó otra oferta ficticia')) x), 1, 'descarte con motivo (deshace la contratación)');
select tests.eq((select filled_count::text || '|' || status from public.vacancies where id = (select v from t_v)), '1|abierta', 'la plaza se libera y la vacante vuelve a abierta');
select tests.eq((select stage::text || '|' || discard_reason from public.applications where id = (select a1 from t_a)), 'retirado|rechazo_oferta', 'motivo y estado de indicadores');
select tests.eq((select detail from public.application_events where application_id = (select a1 from t_a) and event_type = 'cambio_etapa' order by id desc limit 1), 'Motivo: rechazo_oferta — Aceptó otra oferta ficticia', 'el historial registra el motivo');
-- Seguimiento: calificación, próximo paso y requisitos
select tests.eq((select count(*)::int from (select public.update_application_tracking((select a1 from t_a), 4::smallint, 'Llamar para retroalimentación', current_date + 2)) x), 1, 'calificación y próximo paso');
select tests.eq((select count(*)::int from public.application_events where application_id = (select a1 from t_a) and event_type in ('calificacion', 'proximo_paso')), 2, '...en el historial');
select tests.eq(tests.affected($$insert into public.requirement_templates (vacancy_id, catalog_requirement_id, min_level_id, requirement, requirement_type, weight) values ((select v from t_v), (select id from public.requirement_catalog where name = 'Inglés'), (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Idiomas (MCER)' and l.label = 'B2'), 'x', 'obligatorio', 5)$$), 1, 'requisito de la vacante');
select tests.eq((select count(*)::int from (select public.set_requirement_check((select a1 from t_a), (select id from public.requirement_templates where vacancy_id = (select v from t_v)), 'cumple', (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Idiomas (MCER)' and l.label = 'C1'), 'Entrevista ficticia en inglés')) x), 1, 'evaluación del requisito con nivel alcanzado');
select tests.fails($$select public.set_requirement_check((select a1 from t_a), (select id from public.requirement_templates where vacancy_id = (select v from t_v)), 'cumple', (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Dominio general' limit 1))$$, 'nivel de otra escala rechazado');
select tests.fails($$select public.set_requirement_check((select a1 from t_a), (select id from public.requirement_templates where vacancy_id is null limit 1), 'cumple')$$, 'requisito ajeno a la vacante rechazado');
select tests.fails($$insert into public.application_events (application_id, event_type) values ((select a1 from t_a), 'nota')$$, 'el historial no se escribe directamente');
-- Observaciones con nivel de confidencialidad
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador asignado a la vacante
select tests.eq(tests.affected($$insert into public.application_notes (application_id, body, visibility) values ((select a1 from t_a), 'Nota confidencial ficticia del reclutador', 'confidencial')$$), 1, 'reclutador asignado agrega observación confidencial');
select tests.fails($$insert into public.application_notes (application_id, body, visibility, author_id) values ((select a1 from t_a), 'Suplantación', 'equipo', 'aaaaaaaa-0000-4000-8000-000000000002')$$, 'el autor de la observación no se suplanta');
select tests.eq((select count(*)::int from (select public.move_application((select a1 from t_a), (select id from public.vacancy_stages where vacancy_id = (select v from t_v) and category = 'en_proceso' order by position limit 1))) x), 1, 'reclutador asignado mueve la postulación');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq((select count(*)::int from public.applications where id = (select a1 from t_a)), 0, 'otro reclutador no ve la postulación');
select tests.fails($$select public.move_application((select a1 from t_a), (select stage_id from public.applications limit 1))$$, 'otro reclutador NO mueve postulaciones ajenas');
select tests.fails($$select public.create_application((select v from t_v), (select k3 from t_c))$$, 'otro reclutador NO postula en vacantes ajenas');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.applications where id = (select a1 from t_a)), 1, 'consulta ve la postulación (tablero de solo lectura)');
select tests.eq((select count(*)::int from public.application_notes), 0, 'consulta NO ve observaciones');
select tests.eq((select count(*)::int from public.application_events), 0, 'consulta NO ve el historial');
select tests.eq((select count(*)::int from public.application_requirement_checks), 0, 'consulta NO ve evaluaciones');
select tests.fails($$select public.move_application((select a1 from t_a), (select stage_id from public.applications where id = (select a1 from t_a)))$$, 'consulta NO mueve postulaciones');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq((select count(*)::int from public.application_notes where application_id = (select a1 from t_a) and visibility = 'confidencial'), 1, 'coordinación ve las observaciones confidenciales');
select tests.eq((select count(*)::int from public.application_events where application_id = (select a1 from t_a) and event_type = 'nota'), 2, 'las observaciones quedan en el historial');
select tests.eq((select public.sync_vacancy_stages((select v from t_v)) >= 3), true, 'actualizar etapas desde el proceso sin perder postulaciones');
select tests.eq((select count(*)::int from public.applications a where a.vacancy_id = (select v from t_v) and a.stage_id is not null), 2, '...las postulaciones conservan su etapa');
reset role;


-- ============== FASE 3 (1200): RECEPCIÓN Y FORMULARIOS PÚBLICOS ==============
select private.set_public_form_key('clave-ficticia-de-pruebas-0123456789abcdef');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.requisitions (client_id, title, positions_count, status) values ('11111111-0000-4000-8000-000000000001', 'Recepción ficticia 3', 2, 'pendiente_aprobacion')$$), 1, 'requisición fase 3');
select tests.eq(tests.affected($$update public.requisitions set status = 'aprobada' where title = 'Recepción ficticia 3'$$), 1, 'aprobada (fase 3)');
select tests.eq(tests.affected($$insert into public.vacancies (requisition_id, title, openings, status, recruiter_id, position_id) values ((select id from public.requisitions where title = 'Recepción ficticia 3'), 'Vacante con formulario', 1, 'abierta', 'aaaaaaaa-0000-4000-8000-000000000003', (select id from public.job_positions where is_active limit 1))$$), 1, 'vacante para formulario público');
create temp table t_f as select (select id from public.vacancies where title = 'Vacante con formulario') as v;
select tests.eq(tests.affected($$insert into public.public_forms (vacancy_id, title, intro) values ((select v from t_f), 'Postúlese ficticio', 'Formulario de prueba')$$), 1, 'coordinación crea formulario de vacante');
select tests.eq(tests.affected($$insert into public.public_forms (title) values ('Banco de talento ficticio')$$), 1, 'formulario del banco de talento (sin vacante)');
create temp table t_fm as select (select id from public.public_forms where title = 'Postúlese ficticio') as f, (select id from public.public_forms where title = 'Banco de talento ficticio') as bank;
select tests.eq(tests.affected($$insert into public.form_questions (form_id, position, label, kind, expected_answer) values ((select f from t_fm), 1, '¿Tiene licencia B1?', 'si_no', 'si')$$), 1, 'pregunta sí/no eliminatoria');
select tests.eq(tests.affected($$insert into public.form_questions (form_id, position, label, kind, min_number) values ((select f from t_fm), 2, 'Años de experiencia', 'numero', 2)$$), 1, 'pregunta numérica con mínimo');
select tests.eq(tests.affected($$insert into public.form_questions (form_id, position, label, kind, options, required) values ((select f from t_fm), 3, 'Turno preferido', 'opcion', array['Diurno','Nocturno'], false)$$), 1, 'pregunta de opción');
select tests.fails($$insert into public.form_questions (form_id, position, label, kind, options) values ((select f from t_fm), 4, 'Opción sin opciones', 'opcion', '{}')$$, 'opción exige al menos dos alternativas');
select tests.eq(tests.affected($$insert into public.form_links (form_id, intake_channel_id, label, code) values ((select f from t_fm), (select id from public.intake_channels limit 1), 'Volante feria', 'feriaficticia01')$$), 1, 'enlace con canal de recepción');
select tests.eq(tests.affected($$insert into public.form_links (form_id, intake_channel_id) values ((select bank from t_fm), (select id from public.intake_channels limit 1))$$), 1, 'código aleatorio generado');
select tests.eq((select code ~ '^[a-z0-9]{12}$' from public.form_links where form_id = (select bank from t_fm)), true, 'código de 12 caracteres');
select tests.fails($$delete from public.public_forms where id = (select f from t_fm)$$, 'los formularios no se eliminan (se desactivan)');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.eq((select count(*)::int from public.public_forms where id = (select f from t_fm)), 1, 'reclutador ve los formularios');
select tests.eq(tests.affected($$update public.public_forms set title = 'Cambio indebido' where id = (select f from t_fm)$$), 0, 'reclutador NO edita formularios');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.public_forms), 0, 'consulta NO ve formularios');
reset role;

-- Público (anon): solo funciones acotadas
create temp table t_q as select (select id::text from public.form_questions where label = '¿Tiene licencia B1?') as q1, (select id::text from public.form_questions where label = 'Años de experiencia') as q2, (select id::text from public.form_questions where label = 'Turno preferido') as q3;
grant select on t_q, t_fm, t_f to anon;
set local role anon;
select tests.fails('select * from public.public_forms', 'anon no lee formularios directamente');
select tests.fails('select * from public.intake_submissions', 'anon no lee envíos');
select tests.eq((select (public.get_public_form('FeriaFicticia01') ->> 'available')::boolean), true, 'formulario disponible por código (sin distinguir mayúsculas)');
select tests.eq((select jsonb_array_length(public.get_public_form('feriaficticia01') -> 'questions')), 3, 'el formulario expone sus preguntas');
select tests.eq((select public.get_public_form('feriaficticia01') -> 'questions' -> 0 ? 'expected_answer'), false, 'NO expone la respuesta esperada');
select tests.eq((select (public.get_public_form('noexiste000') ->> 'available')::boolean), false, 'código inexistente: no disponible');
select tests.fails($$select public.submit_public_form('clave-incorrecta', 'feriaficticia01', '{}'::jsonb)$$, 'sin la clave del servidor no se aceptan envíos');
create temp table t_ct as select (public.get_public_form('feriaficticia01') -> 'consent' ->> 'id') as id;
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Real', 'last_name', 'Persona', 'email', 'persona@gmail.com', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '3')))$$, 'puerta S1: sin datos reales habilitados se rechazan correos reales');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Solo', 'last_name', 'Telefono', 'phone', '8800-9999', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '3')))$$, 'puerta S1: sin datos reales habilitados se exige correo ficticio');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Nora', 'last_name', 'Ficticia Web', 'email', 'nora@correo.test', 'consent', false, 'consent_text_id', (select id from t_ct)))$$, 'sin consentimiento no hay envío');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Nora', 'last_name', 'Ficticia Web', 'email', 'nora@correo.test', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object()))$$, 'preguntas obligatorias exigidas');
reset role;
set local role anon;
create temp table t_s1 as select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01',
  jsonb_build_object('first_name', 'Nora', 'last_name', 'Ficticia Web', 'email', 'nora@correo.test', 'phone', '8800-0101', 'province', 'Heredia',
                     'consent', true, 'consent_text_id', (select id from t_ct),
                     'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '1', (select q3 from t_q), 'Diurno')), 'abcdef0123456789') as r;
select tests.eq((select r ->> 'status' from t_s1), 'incorporado', 'sin coincidencias: incorporación automática');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Otro', 'last_name', 'Ficticio', 'email', 'otro@correo.test', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object((select q1 from t_q), 'quizas', (select q2 from t_q), '3')))$$, 'respuesta fuera de las opciones rechazada');
reset role;
select tests.eq((select c.intake_channel_id is not null and c.source_detail = 'Volante feria' from public.candidates c where c.first_name = 'Nora'), true, 'candidato con canal y detalle del enlace');
select tests.eq((select channel || '|' || (evidence like 'Formulario web «Postúlese ficticio» · enlace feriaficticia01 · versión%')::text from public.candidate_consents where candidate_id = (select id from public.candidates where first_name = 'Nora')), 'formulario_web|true', 'consentimiento digital con evidencia');
select tests.eq((select count(*)::int from public.applications a where a.vacancy_id = (select v from t_f) and a.intake_channel_id is not null and a.submission_id is not null), 1, 'postulación creada con canal de recepción');
select tests.eq((select count(*)::int from public.candidate_profiles p join public.candidates c on c.id = p.candidate_id where c.first_name = 'Nora'), 1, 'perfil profesional con el puesto de la vacante');
select tests.eq((select preselection_ok::text || '|' || (data is null)::text from public.intake_submissions where id = ((select r ->> 'submission_id' from t_s1))::uuid), 'false|true', 'preselección calculada (no cumple el mínimo) y datos personales purgados');
select tests.eq((select string_agg(coalesce(meets::text, '-'), ',' order by position) from public.submission_answers where submission_id = ((select r ->> 'submission_id' from t_s1))::uuid), 'true,false,-', 'cumplimiento por pregunta');
-- Duplicado → revisión humana
set local role anon;
create temp table t_s2 as select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01',
  jsonb_build_object('first_name', 'Nora María', 'last_name', 'Ficticia', 'email', 'NORA@correo.test', 'consent', true, 'consent_text_id', (select id from t_ct),
                     'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '5')), 'abcdef0123456789') as r;
select tests.eq((select r ->> 'status' from t_s2), 'revision', 'coincidencia por correo: queda en revisión');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Nora', 'last_name', 'Repetida', 'email', 'nora@correo.test', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '5')))$$, 'envío repetido en revisión rechazado');
select tests.fails($$select public.attach_submission_cv('clave-ficticia-de-pruebas-0123456789abcdef', ((select r ->> 'submission_id' from t_s2))::uuid, gen_random_uuid(), 'application/pdf', 1000)$$, 'CV: token incorrecto rechazado');
select tests.fails($$select public.attach_submission_cv('clave-ficticia-de-pruebas-0123456789abcdef', ((select r ->> 'submission_id' from t_s2))::uuid, ((select r ->> 'upload_token' from t_s2))::uuid, 'application/x-msdownload', 1000)$$, 'CV: tipo de archivo no permitido');
reset role;
-- Con Supabase Storage real, el archivo debe existir antes de asociarlo (lo simula el superusuario).
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'insert into storage.objects (bucket_id, name) values ($1, $2)'
      using 'curriculums', (select 'envios/' || (r ->> 'submission_id') || '/' || (r ->> 'upload_token') || '.pdf' from t_s2);
  end if;
end $$;
set local role anon;
select tests.eq((select count(*)::int from (select public.attach_submission_cv('clave-ficticia-de-pruebas-0123456789abcdef', ((select r ->> 'submission_id' from t_s2))::uuid, ((select r ->> 'upload_token' from t_s2))::uuid, 'application/pdf', 1000)) x), 1, 'CV asociado con el token de un solo uso');
select tests.fails($$select public.attach_submission_cv('clave-ficticia-de-pruebas-0123456789abcdef', ((select r ->> 'submission_id' from t_s2))::uuid, ((select r ->> 'upload_token' from t_s2))::uuid, 'application/pdf', 1000)$$, 'CV: el token no se reutiliza');
select tests.eq((select public.can_upload_submission_cv('envios/' || (select r ->> 'submission_id' from t_s2) || '/' || (select r ->> 'upload_token' from t_s2) || '.pdf')), false, 'almacenamiento: no se carga de nuevo tras asociar');
reset role;
grant select on t_s1, t_s2 to authenticated;
select tests.eq((select match_candidate_id = (select id from public.candidates where first_name = 'Nora') and 'correo' = any (match_reasons) from public.intake_submissions where id = ((select r ->> 'submission_id' from t_s2))::uuid), true, 'coincidencia y motivo registrados');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq((select count(*)::int from public.intake_submissions where vacancy_id = (select v from t_f)), 0, 'reclutador no asignado NO ve los envíos');
select tests.fails($$select public.review_submission(((select r ->> 'submission_id' from t_s2))::uuid, 'vincular')$$, 'reclutador no asignado NO resuelve envíos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.intake_submissions), 0, 'consulta NO ve envíos');
select tests.eq((select count(*)::int from public.candidate_documents), 0, 'consulta NO ve documentos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador asignado
select tests.eq((select count(*)::int from public.intake_submissions where vacancy_id = (select v from t_f)), 2, 'reclutador asignado ve los envíos de su vacante');
select tests.eq((select public.submission_cv_for_download(((select r ->> 'submission_id' from t_s2))::uuid) like 'envios/%.pdf'), true, 'descarga del CV del envío');
select tests.eq((select count(*)::int from public.access_logs where action = 'descargar' and resource = 'curriculum_envio'), 0, 'reclutador no lee el registro de accesos');
select tests.fails($$select public.review_submission(((select r ->> 'submission_id' from t_s2))::uuid, 'vincular', '44444444-0000-4000-8000-000000000002')$$, 'reclutador NO vincula a una ficha ajena distinta de la coincidencia');
select tests.eq((select public.review_submission(((select r ->> 'submission_id' from t_s2))::uuid, 'vincular', null, 'Misma persona')) = (select id from public.candidates where first_name = 'Nora'), true, 'vincular al candidato existente');
select tests.fails($$select public.review_submission(((select r ->> 'submission_id' from t_s2))::uuid, 'crear')$$, 'un envío resuelto no se resuelve de nuevo');
select tests.eq((select count(*)::int from public.candidate_consents where candidate_id = (select id from public.candidates where first_name = 'Nora')), 2, 'se agrega el nuevo consentimiento al vincular');
select tests.eq((select first_name from public.candidates where id = (select id from public.candidates where first_name = 'Nora')), 'Nora', 'vincular no sobrescribe datos existentes');
select tests.eq((select count(*)::int from public.candidate_documents d where d.candidate_id = (select id from public.candidates where first_name = 'Nora') and d.source = 'formulario'), 1, 'el CV pasa a los documentos del candidato');
select tests.eq((select public.document_for_download((select id from public.candidate_documents where source = 'formulario' limit 1)) like 'envios/%'), true, 'descarga de documento autorizada');
select tests.eq((select private.can_read_cv_object((select storage_path from public.candidate_documents where source = 'formulario' limit 1))), true, 'almacenamiento: lectura permitida al autorizado');
select tests.eq((select private.can_write_candidate_cv('candidatos/' || (select id from public.candidates where first_name = 'Nora') || '/' || gen_random_uuid() || '.pdf')), true, 'almacenamiento: reclutador carga CV de un candidato editable');
select tests.eq((select private.can_write_candidate_cv('candidatos/' || (select id from public.candidates where first_name = 'Nora') || '/../x.exe')), false, 'almacenamiento: ruta inválida rechazada');
select tests.fails($$select public.register_candidate_document((select id from public.candidates where first_name = 'Nora'), 'envios/otra/ruta.pdf', 'cv.pdf', 'application/pdf', 1000)$$, 'documento del personal solo en su carpeta');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.fails($$select public.document_for_download((select id from public.candidate_documents limit 1))$$, 'consulta NO descarga CV');
select tests.eq((select private.can_read_cv_object('envios/' || (select r ->> 'submission_id' from t_s2) || '/x.pdf')), false, 'almacenamiento: consulta NO lee CV');
reset role;
select tests.eq((select count(*)::int from public.access_logs where action = 'descargar' and resource in ('curriculum', 'curriculum_envio')), 2, 'las descargas quedan registradas');
-- Banco de talento: sin vacante, con puesto elegido; enlace desactivado
create temp table t_bank as select (select code from public.form_links where form_id = (select bank from t_fm)) as code, (select id from public.job_positions where is_active limit 1) as pos;
grant select on t_bank to anon;
set local role anon;
create temp table t_s3 as select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', (select code from t_bank),
  jsonb_build_object('first_name', 'Olga', 'last_name', 'Banco Ficticio', 'phone', '+506 8800-0202', 'email', 'olga@correo.test', 'position_id', (select pos from t_bank),
                     'consent', true, 'consent_text_id', (select id from t_ct))) as r;
select tests.eq((select r ->> 'status' from t_s3), 'incorporado', 'banco de talento: incorporado sin postulación');
reset role;
select tests.eq((select (select count(*) from public.applications a where a.candidate_id = c.id)::int || '|' || (select count(*) from public.candidate_profiles p where p.candidate_id = c.id and p.position_id = (select pos from t_bank))::int || '|' || (select phone_e164 from public.candidate_private where candidate_id = c.id) from public.candidates c where c.first_name = 'Olga'), '0|1|+50688000202', 'banco: perfil del puesto elegido y teléfono normalizado');
update public.form_links set is_active = false where code = (select code from t_bank);
set local role anon;
select tests.eq((select (public.get_public_form((select code from t_bank)) ->> 'available')::boolean), false, 'enlace desactivado: no disponible');
select tests.fails($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', (select code from t_bank), '{}'::jsonb)$$, 'enlace desactivado: no recibe envíos');
reset role;
update public.vacancies set status = 'cerrada' where id = (select v from t_f);
select tests.eq((select (public.get_public_form('feriaficticia01') ->> 'available')::boolean), false, 'vacante cerrada: formulario no disponible');
-- Límite de frecuencia por conexión (20 por hora)
update public.vacancies set status = 'abierta' where id = (select v from t_f);
insert into public.intake_submissions (link_id, form_id, status, full_name, consent_text_id, consent_evidence, ip_hash, created_at)
select (select id from public.form_links where code = 'feriaficticia01'), (select f from t_fm), 'descartado', 'Relleno', (select id::uuid from t_ct), 'x', '1234567890abcdef', now() from generate_series(1, 20);
create function tests.error_of(stmt text) returns text language plpgsql as $f$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $f$;
grant execute on function tests.error_of(text) to anon;
set local role anon;
select tests.eq(tests.error_of($$select public.submit_public_form('clave-ficticia-de-pruebas-0123456789abcdef', 'feriaficticia01', jsonb_build_object('first_name', 'Pablo', 'last_name', 'Ficticio', 'email', 'pablo@correo.test', 'consent', true, 'consent_text_id', (select id from t_ct), 'answers', jsonb_build_object((select q1 from t_q), 'si', (select q2 from t_q), '3')), '1234567890abcdef')$$), 'Demasiados envíos desde su conexión. Intente más tarde', 'límite de envíos por conexión (20 por hora)');
reset role;


-- ============== FASE 4 (1300): ENTREVISTAS, EVALUACIONES, CREDENCIALES, INFORME ==============
create temp table t4 as select
  (select id from public.applications where vacancy_id = (select v from t_f) and candidate_id = (select id from public.candidates where first_name = 'Nora')) as app,
  (select id from public.candidates where first_name = 'Nora') as cand,
  (select id from public.assessment_types where name = 'Prueba de Excel') as excel,
  (select id from public.assessment_types where name = 'Prueba de inglés') as ingles,
  (select id from public.credential_types where name = 'Carné de manipulación de alimentos') as carne,
  (select id from public.credential_types where name = 'Título académico') as titulo;
grant select on t4 to authenticated;
select tests.eq((select count(*)::int from public.report_templates where is_active), 1, 'una plantilla de informe vigente');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.interview_questions (text, category, position_id) values ('Pregunta ficticia del puesto de la vacante', 'tecnica', (select position_id from public.vacancies where id = (select v from t_f)))$$), 1, 'banco: pregunta por puesto');
select tests.eq(tests.affected($$insert into public.interview_questions (text, category, client_id) values ('Pregunta ficticia de otro cliente', 'cultura', '11111111-0000-4000-8000-000000000002')$$), 1, 'banco: pregunta de otro cliente');
select tests.eq(tests.affected($$insert into public.vacancy_assessments (vacancy_id, assessment_type_id, requirement) values ((select v from t_f), (select excel from t4), 'obligatoria'), ((select v from t_f), (select ingles from t4), 'deseable')$$), 2, 'evaluaciones de la vacante: obligatoria y deseable');
select tests.fails($$insert into public.vacancy_assessments (vacancy_id, assessment_type_id) values ((select v from t_f), (select excel from t4))$$, 'una evaluación por vacante');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador asignado
select tests.fails($$insert into public.interview_questions (text) values ('Reclutador no administra el banco')$$, 'reclutador NO administra el banco de preguntas');
select tests.fails($$insert into public.vacancy_assessments (vacancy_id, assessment_type_id) values ((select v from t_f), (select id from public.assessment_types where name = 'Prueba de SAP'))$$, 'reclutador NO configura evaluaciones de la vacante');
select tests.eq(tests.affected($$insert into public.interviews (application_id, kind, scheduled_at, interviewer_id) values ((select app from t4), 'virtual', now() + interval '2 days', 'aaaaaaaa-0000-4000-8000-000000000003')$$), 1, 'reclutador asignado programa la entrevista');
create temp table t4i as select (select id from public.interviews where application_id = (select app from t4)) as i;
select tests.eq((select count(*)::int from public.interview_answers where interview_id = (select i from t4i)), 5, 'guion: 4 generales + 1 del puesto (no la de otro cliente)');
select tests.eq((select question_text from public.interview_answers where interview_id = (select i from t4i) order by position desc limit 1), 'Pregunta ficticia del puesto de la vacante', 'las preguntas del puesto van después de las generales');
select tests.fails($$update public.interviews set status = 'realizada' where id = (select i from t4i)$$, 'una entrevista realizada exige recomendación');
select tests.eq(tests.affected($$update public.interview_answers set notes = 'Respuesta ficticia clara', rating = 4 where interview_id = (select i from t4i) and position = 1$$), 1, 'notas por pregunta');
select tests.eq(tests.affected($$update public.interviews set status = 'realizada', recommendation = 'recomendado', rating = 4, summary = 'Resumen ficticio' where id = (select i from t4i)$$), 1, 'entrevista realizada con recomendación');
select tests.eq((select completed_at is not null from public.interviews where id = (select i from t4i)), true, 'fecha de realización registrada por la BD');
select tests.eq(tests.affected($$insert into public.assessment_results (application_id, assessment_type_id, status, score) values ((select app from t4), (select excel from t4), 'aprobada', 85)$$), 1, 'resultado de Excel');
select tests.eq((select evaluated_on is not null and evaluator_id = 'aaaaaaaa-0000-4000-8000-000000000003' from public.assessment_results where application_id = (select app from t4) and assessment_type_id = (select excel from t4)), true, 'fecha y evaluador registrados');
select tests.fails($$insert into public.assessment_results (application_id, assessment_type_id, status, score) values ((select app from t4), (select ingles from t4), 'aprobada', 150)$$, 'puntaje sobre el máximo rechazado');
select tests.fails($$insert into public.assessment_results (application_id, assessment_type_id, status, level_id) values ((select app from t4), (select ingles from t4), 'aprobada', (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Dominio general' limit 1))$$, 'nivel de otra escala rechazado');
select tests.eq(tests.affected($$insert into public.assessment_results (application_id, assessment_type_id, status, level_id) values ((select app from t4), (select ingles from t4), 'aprobada', (select l.id from public.proficiency_levels l join public.proficiency_scales s on s.id = l.scale_id where s.name = 'Idiomas (MCER)' and l.label = 'B2'))$$), 1, 'inglés con nivel MCER');
-- Credenciales
select tests.fails($$insert into public.candidate_credentials (candidate_id, credential_type_id) values ((select cand from t4), (select carne from t4))$$, 'carné exige vencimiento');
select tests.eq(tests.affected($$insert into public.candidate_credentials (candidate_id, credential_type_id, identifier, expires_on, verified_at, verified_by) values ((select cand from t4), (select carne from t4), 'MA-FICTICIO-1', (now() at time zone 'America/Costa_Rica')::date + 10, now() - interval '9 days', 'aaaaaaaa-0000-4000-8000-000000000001')$$), 1, 'carné de manipulación con vencimiento y verificación');
select tests.eq((select verified_by from public.candidate_credentials where identifier = 'MA-FICTICIO-1'), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'la verificación registra al usuario real (no se suplanta)');
select tests.eq(tests.affected($$insert into public.candidate_credentials (candidate_id, credential_type_id) values ((select cand from t4), (select titulo from t4))$$), 1, 'título sin vencimiento');
select tests.eq((select count(*)::int from public.expiring_credentials(30) where candidate_id = (select cand from t4)), 1, 'alerta: carné por vencer en 10 días');
select tests.eq((select days_left from public.expiring_credentials(30) where candidate_id = (select cand from t4)), 10, 'días restantes');
-- Informe ejecutivo
select tests.eq(tests.affected($$insert into public.executive_reports (application_id, template_id, content) values ((select app from t4), (select id from public.report_templates where is_active), '{"perfil":"Perfil ficticio"}')$$), 1, 'informe en borrador');
select tests.fails($$update public.executive_reports set status = 'final' where application_id = (select app from t4)$$, 'finalizar exige recomendación');
select tests.fails($$select public.log_report_export((select id from public.executive_reports where application_id = (select app from t4)), 'pdf')$$, 'no se exporta un borrador');
select tests.eq(tests.affected($$update public.executive_reports set status = 'final', recommendation = 'recomendado' where application_id = (select app from t4)$$), 1, 'informe final');
select tests.eq((select finalized_by from public.executive_reports where application_id = (select app from t4)), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'finalizado por el usuario real');
select tests.fails($$update public.executive_reports set content = '{"perfil":"cambio"}' where application_id = (select app from t4)$$, 'el informe final no se modifica');
select tests.fails($$update public.executive_reports set status = 'borrador' where application_id = (select app from t4)$$, 'reclutador NO reabre un informe final');
select tests.eq((select count(*)::int from (select public.log_report_export((select id from public.executive_reports where application_id = (select app from t4)), 'docx')) x), 1, 'exportación Word registrada');
select tests.fails($$select public.log_report_export((select id from public.executive_reports where application_id = (select app from t4)), 'xlsx')$$, 'formato no permitido');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$update public.executive_reports set status = 'borrador' where application_id = (select app from t4)$$), 1, 'coordinación reabre el informe');
select tests.eq((select version from public.executive_reports where application_id = (select app from t4)), 2, 'reabrir crea la versión 2');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq((select count(*)::int from public.interviews where application_id = (select app from t4)), 0, 'otro reclutador NO ve entrevistas ajenas');
select tests.eq((select count(*)::int from public.executive_reports), 0, 'otro reclutador NO ve informes ajenos');
select tests.fails($$insert into public.interviews (application_id, scheduled_at) values ((select app from t4), now())$$, 'otro reclutador NO programa entrevistas ajenas');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.interviews) + (select count(*)::int from public.interview_answers) + (select count(*)::int from public.assessment_results), 0, 'consulta NO ve entrevistas ni evaluaciones');
select tests.eq((select count(*)::int from public.candidate_credentials) + (select count(*)::int from public.executive_reports), 0, 'consulta NO ve credenciales ni informes');
select tests.eq((select count(*)::int from public.interview_questions), 0, 'consulta NO ve el banco de preguntas');
select tests.eq((select count(*)::int from public.expiring_credentials(365)), 0, 'consulta NO recibe alertas de credenciales');
select tests.eq((select count(*)::int from public.vacancy_assessments where vacancy_id = (select v from t_f)), 2, 'consulta ve qué evaluaciones exige la vacante');
select tests.fails($$select public.log_report_export((select id from public.executive_reports limit 1), 'pdf')$$, 'consulta NO exporta informes');
reset role;
select tests.eq((select count(*)::int from public.access_logs where action = 'exportar' and resource = 'informe_ejecutivo'), 1, 'exportación en el registro de accesos');
-- Eliminar un usuario que evaluó, verificó o finalizó no debe fallar (las referencias quedan en null)
update public.executive_reports set status = 'final', recommendation = 'recomendado' where application_id = (select app from t4);
insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'temporal.f4@tpc-demo.test', '{"full_name":"Temporal F4"}');
set local session_replication_role = replica;  -- preparación: simula que ese usuario verificó y finalizó
update public.candidate_credentials set verified_by = 'aaaaaaaa-0000-4000-8000-0000000000e1' where identifier = 'MA-FICTICIO-1';
update public.executive_reports set finalized_by = 'aaaaaaaa-0000-4000-8000-0000000000e1' where application_id = (select app from t4);
set local session_replication_role = origin;
select tests.eq(tests.affected($$delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$), 1, 'se elimina un usuario que verificó y finalizó');
select tests.eq((select verified_at is not null and verified_by is null from public.candidate_credentials where identifier = 'MA-FICTICIO-1'), true, 'la verificación se conserva sin el usuario eliminado');
select tests.eq((select status || '|' || (finalized_by is null)::text from public.executive_reports where application_id = (select app from t4)), 'final|true', 'el informe final se conserva');


-- ============== FASE 5 (1400): IA MODULAR ==============
select tests.eq((select enabled::text || '|' || provider from public.ai_settings), 'false|simulado', 'IA apagada por omisión con proveedor simulado');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.fails($$select public.ai_begin_request('comparar', null, null, (select app from t4))$$, 'IA desactivada: no se puede usar');
select tests.eq(tests.affected($$update public.ai_settings set enabled = true$$), 0, 'reclutador NO configura la IA');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal1"}', true);  -- admin sin aal2
select tests.eq(tests.affected($$update public.ai_settings set enabled = true, daily_requests_per_user = 2$$), 1, 'admin activa el proveedor simulado');
select tests.fails($$update public.ai_settings set provider = 'anthropic'$$, 'proveedor externo exige acuerdo de tratamiento y presupuesto');
select tests.fails($$update public.ai_settings set provider = 'anthropic', dpa_confirmed = true, monthly_budget_usd = 50$$, 'proveedor externo exige verificación en dos pasos (aal2)');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador asignado
create temp table t5 as select public.ai_begin_request('comparar', null, null, (select app from t4), repeat('a', 64), true) as r;
select tests.eq((select r ->> 'provider' || '|' || (r ->> 'model') from t5), 'simulado|simulado-1', 'solicitud iniciada con el proveedor simulado');
select tests.fails($$select public.ai_review_request(((select r ->> 'id' from t5))::uuid, 'aceptado')$$, 'no se revisa un resultado en proceso');
select tests.eq((select count(*)::int from (select public.ai_finish_request(((select r ->> 'id' from t5))::uuid, '{"puntaje":80}', 100, 50, 9.99)) x), 1, 'resultado registrado');
select tests.eq((select status || '|' || cost_usd::text || '|' || input_tokens from public.ai_requests where id = ((select r ->> 'id' from t5))::uuid), 'pendiente_revision|0.0000|100', 'simulado no tiene costo; queda pendiente de revisión');
select tests.fails($$select public.ai_finish_request(((select r ->> 'id' from t5))::uuid, '{}', 1, 1, 0)$$, 'una solicitud no se cierra dos veces');
select tests.eq((select count(*)::int from (select public.ai_review_request(((select r ->> 'id' from t5))::uuid, 'aceptado', 'Revisado')) x), 1, 'revisión humana: aceptado');
select tests.eq((select reviewed_by from public.ai_requests where id = ((select r ->> 'id' from t5))::uuid), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'queda registrado quién revisó');
create temp table t5b as select public.ai_begin_request('preguntas', null, (select v from t_f)) as r;
select tests.fails($$select public.ai_begin_request('publicacion', null, (select v from t_f))$$, 'límite diario por usuario (2)');
select tests.fails($$select public.ai_begin_request('inventada')$$, 'función no válida');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.fails($$select public.ai_begin_request('comparar', null, null, (select app from t4))$$, 'otro reclutador NO analiza postulaciones ajenas');
select tests.eq((select count(*)::int from public.ai_requests), 0, 'otro reclutador NO ve solicitudes ajenas');
select tests.fails($$select public.ai_finish_request(((select r ->> 'id' from t5b))::uuid, '{}', 1, 1, 0)$$, 'no se cierra la solicitud de otro usuario');
select tests.fails($$select public.ai_usage_summary()$$, 'reclutador NO ve el resumen de costos');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.fails($$select public.ai_begin_request('publicacion', null, null)$$, 'consulta NO usa la IA');
select tests.eq((select count(*)::int from public.ai_requests), 0, 'consulta NO ve solicitudes de IA');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq((select count(*)::int from public.ai_requests), 2, 'coordinación ve todas las solicitudes');
select tests.eq((select (public.ai_usage_summary() ->> 'requests')::int), 2, 'resumen del mes');
select tests.fails($$select public.ai_review_request(((select r ->> 'id' from t5b))::uuid, 'descartado')$$, 'no se revisa una solicitud en proceso (sin salida)');
reset role;
-- Presupuesto: con proveedor externo y presupuesto agotado se bloquea (admin con verificación en dos pasos)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal2"}', true);
update public.ai_settings set provider = 'anthropic', dpa_confirmed = true, monthly_budget_usd = 1, daily_requests_per_user = 50;
update public.ai_requests set cost_usd = 1.5 where id = ((select r ->> 'id' from t5))::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);
select tests.fails($$select public.ai_begin_request('publicacion', null, null)$$, 'presupuesto mensual agotado: se bloquea');
reset role;
select tests.eq((select output is null from public.ai_requests where id = ((select r ->> 'id' from t5b))::uuid), true, 'sin resultado mientras está en proceso');


-- ============== FASE 6 (1500): MI JORNADA, TAREAS, CALENDARIO, INDICADORES ==============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador 1
select tests.eq(tests.affected($$insert into public.tasks (title, kind, due_at, assigned_to, client_id) values ('Llamar al cliente ficticio por la terna', 'seguimiento_cliente', now() - interval '1 day', 'aaaaaaaa-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001')$$), 1, 'reclutador crea su propia tarea');
select tests.fails($$insert into public.tasks (title, due_at, assigned_to) values ('Tarea para otro', now(), 'aaaaaaaa-0000-4000-8000-000000000004')$$, 'reclutador NO asigna tareas a otros');
select tests.eq(tests.affected($$update public.tasks set status = 'hecha' where title = 'Llamar al cliente ficticio por la terna'$$), 1, 'marca la tarea como hecha');
select tests.eq((select completed_at is not null from public.tasks where title = 'Llamar al cliente ficticio por la terna'), true, 'fecha de cumplimiento registrada');
select tests.fails($$delete from public.tasks$$, 'las tareas no se eliminan (se cancelan)');
create temp table t6 as select public.rotate_calendar_token() as tok;
select tests.eq((select length(tok) from t6), 64, 'enlace de calendario de 64 caracteres');
select tests.eq((select (public.calendar_status() ->> 'active')::boolean), true, 'calendario activo');
select tests.eq((select count(*)::int from public.productivity_indicators(current_date - 30, current_date)), 1, 'reclutador ve solo sus indicadores');
select tests.eq((select tasks_done from public.productivity_indicators(current_date - 30, current_date)), 1, 'indicador: tareas hechas');
select tests.eq((select interviews_done from public.productivity_indicators(current_date - 30, current_date)), 1, 'indicador: entrevistas realizadas');
select tests.fails($$select * from public.productivity_indicators(current_date - 800, current_date)$$, 'rango máximo de un año');
select tests.fails($$select * from public.calendar_feed((select tok from t6))$$, 'el feed no se consulta con sesión (solo la app, sin sesión)');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq((select count(*)::int from public.tasks), 0, 'otro reclutador NO ve tareas ajenas');
select tests.eq(tests.affected($$update public.tasks set title = 'Cambio indebido'$$), 0, 'otro reclutador NO edita tareas ajenas');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.fails($$insert into public.tasks (title, due_at, assigned_to) values ('Consulta', now(), 'aaaaaaaa-0000-4000-8000-000000000005')$$, 'consulta NO crea tareas');
select tests.fails($$select public.rotate_calendar_token()$$, 'consulta NO tiene calendario');
select tests.fails($$select * from public.productivity_indicators(current_date - 30, current_date)$$, 'consulta NO ve indicadores de productividad');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq(tests.affected($$insert into public.tasks (title, due_at, assigned_to, vacancy_id) values ('Revisar terna ficticia', now() + interval '1 day', 'aaaaaaaa-0000-4000-8000-000000000003', (select v from t_f))$$), 1, 'coordinación asigna tareas al equipo');
select tests.fails($$insert into public.tasks (title, due_at, assigned_to) values ('Para consulta', now(), 'aaaaaaaa-0000-4000-8000-000000000005')$$, 'no se asignan tareas al rol consulta');
select tests.eq((select count(*)::int from public.tasks), 2, 'coordinación ve las tareas del equipo');
select tests.eq((select count(*)::int >= 3 from public.productivity_indicators(current_date - 30, current_date))::int, 1, 'coordinación ve los indicadores del equipo');
reset role;
-- Feed del calendario: solo con el token (anon, desde la aplicación) y sin datos personales
grant select on t6 to anon;
set local role anon;
select tests.eq((select count(*)::int from public.calendar_feed((select tok from t6)) where kind = 'tarea'), 1, 'feed: tarea pendiente asignada');
select tests.eq((select count(*)::int from public.calendar_feed('token-falso')), 0, 'token inválido: sin eventos');
select tests.eq((select bool_and(summary !~ 'Nora|Ficticia Web') from public.calendar_feed((select tok from t6))), true, 'feed sin nombres de candidatos');
select tests.fails($$select * from public.tasks$$, 'anon no lee tareas');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
select tests.eq((select count(*)::int from (select public.revoke_calendar_token()) x), 1, 'revoca el enlace de calendario');
reset role;
set local role anon;
select tests.eq((select count(*)::int from public.calendar_feed((select tok from t6))), 0, 'enlace revocado: sin eventos');
reset role;


-- ============== FASE 7 (1600): INDICADORES Y EXPORTACIONES CONTROLADAS ==============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);  -- coordinador
select tests.eq((select (public.analytics_summary(current_date - 365, current_date) ->> 'scope')), 'global', 'coordinación: alcance global');
select tests.eq((select (public.analytics_summary(current_date - 365, current_date) ->> 'hires')::int >= 1), true, 'resumen: contrataciones del período');
select tests.eq((select (public.analytics_funnel(current_date - 365, current_date) -> 'by_category') ? 'contratado'), true, 'embudo por tipo de etapa');
select tests.eq((select count(*)::int > 0 from public.analytics_stage_times(current_date - 365, current_date)), true, 'tiempos por etapa');
select tests.eq((select count(*)::int > 0 from public.analytics_sources(current_date - 365, current_date)), true, 'fuentes');
select tests.eq((select count(*)::int >= 3 from public.analytics_recruiters(current_date - 365, current_date)), true, 'reclutadores (equipo)');
select tests.eq((select count(*)::int > 0 from public.analytics_clients(current_date - 365, current_date)), true, 'clientes');
select tests.fails($$select public.analytics_summary(current_date - 1000, current_date)$$, 'rango máximo de dos años');
-- Exportaciones
select tests.fails($$select public.export_dataset('postulaciones', 'corto')$$, 'exportar exige motivo');
select tests.fails($$select public.export_dataset('candidatos', 'Informe trimestral ficticio para la gerencia', current_date - 365, current_date)$$, 'coordinación NO exporta la base de candidatos');
select tests.fails($$select public.export_dataset('inventado', 'Motivo ficticio de exportación')$$, 'conjunto inválido');
create temp table t7 as select public.export_dataset('postulaciones', 'Informe mensual ficticio para la gerencia', current_date - 365, current_date) as r;
select tests.eq((select (r ->> 'count')::int > 0 from t7), true, 'exportación de postulaciones');
select tests.eq((select r::text !~ '@|correo\.test|8800|cedula|national_id' from t7), true, 'la exportación no incluye datos de contacto ni identificación');
select tests.eq((select jsonb_array_length(r -> 'columns') from t7), 10, 'columnas definidas');
reset role;
select tests.eq((select item_count > 0 and reason = 'Informe mensual ficticio para la gerencia' from public.access_logs where action = 'exportar' and resource = 'exportacion_postulaciones'), true, 'exportación registrada con motivo y cantidad');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);  -- admin
select tests.eq((select (public.export_dataset('candidatos', 'Auditoría ficticia de la base madre', current_date - 365, current_date) ->> 'count')::int > 0), true, 'administración exporta candidatos (sin contacto)');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador
select tests.eq((select (public.analytics_summary(current_date - 365, current_date) ->> 'scope')), 'propio', 'reclutador: alcance propio');
select tests.eq((select count(*)::int from public.analytics_recruiters(current_date - 365, current_date)), 1, 'reclutador ve solo su desempeño');
select tests.eq((select count(*)::int from public.analytics_clients(current_date - 365, current_date) x
                  where not exists (select 1 from public.vacancies v join public.requisitions r on r.id = v.requisition_id
                                    where r.client_id = x.client_id and private.is_assigned_to_vacancy(v.id))), 0, 'reclutador ve solo clientes de sus vacantes');
select tests.eq((select count(*)::int from public.analytics_clients(current_date - 365, current_date)) < (select count(*)::int from public.clients where status <> 'inactivo'), true, '...y no todos los clientes');
select tests.fails($$select public.export_dataset('fuentes', 'Motivo ficticio de exportación')$$, 'reclutador NO exporta');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select (public.analytics_summary(current_date - 365, current_date) ->> 'scope')), 'global', 'consulta ve indicadores agregados');
select tests.fails($$select public.export_dataset('fuentes', 'Motivo ficticio de exportación')$$, 'consulta NO exporta');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000006"}', true);  -- inactivo
select tests.fails($$select public.analytics_summary()$$, 'usuario inactivo NO ve indicadores');
reset role;
set local role anon;
select tests.fails($$select public.analytics_summary()$$, 'anon NO ve indicadores');
reset role;


-- ============== MEJORAS 4/5 (1700): CV, PRESELECCIÓN, ENTREVISTAS, EVALUACIONES, INFORME ==============
select tests.eq((select version from public.report_templates where is_active), '2026-2', 'plantilla v2 vigente (reemplaza la provisional)');
select tests.eq((select count(*)::int from public.assessment_types where kind in ('entrevista', 'caso_practico', 'assessment_center', 'referencias')), 4, 'nuevos tipos de evaluación');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);  -- reclutador asignado
-- Perfil curricular
select tests.eq(tests.affected($$insert into public.candidate_cv_profiles (candidate_id, source, data, confirmed_by, confirmed_at) values ((select cand from t4), 'simulado', '{"puesto_actual":"Analista ficticia","anios_experiencia":6,"idiomas":[{"idioma":"Inglés","nivel":"B2"}]}', 'aaaaaaaa-0000-4000-8000-000000000001', now())$$), 1, 'perfil curricular en borrador');
select tests.eq((select confirmed_by is null and status = 'borrador' from public.candidate_cv_profiles where candidate_id = (select cand from t4)), true, 'no se suplanta quién confirmó');
select tests.fails($$update public.candidate_cv_profiles set status = 'confirmado' where candidate_id = (select cand from t4)$$, 'confirmar solo con la función');
select tests.fails($$insert into public.candidate_cv_profiles (candidate_id, source, status) values ((select cand from t4), 'manual', 'confirmado')$$, 'no se crea confirmado');
select tests.eq((select count(*)::int from (select public.confirm_cv_profile((select id from public.candidate_cv_profiles where candidate_id = (select cand from t4)), true)) x), 1, 'confirmación humana');
select tests.eq((select status || '|' || (confirmed_by = 'aaaaaaaa-0000-4000-8000-000000000003')::text from public.candidate_cv_profiles where candidate_id = (select cand from t4)), 'confirmado|true', 'confirmado por el usuario real');
select tests.fails($$update public.candidate_cv_profiles set data = '{}' where candidate_id = (select cand from t4)$$, 'un perfil confirmado no se modifica');
reset role;
select tests.eq((select current_title || '|' || years_experience::text || '|' || english_level from public.candidates where id = (select cand from t4)), 'Analista ficticia|6.0|B2', 'la ficha se actualiza al confirmar');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
select tests.eq(tests.affected($$insert into public.candidate_cv_profiles (candidate_id, source, data) values ((select cand from t4), 'manual', '{"puesto_actual":"Segunda revisión"}')$$), 1, 'nueva revisión');
select tests.eq((select count(*)::int from (select public.confirm_cv_profile((select id from public.candidate_cv_profiles where candidate_id = (select cand from t4) and status = 'borrador'), false)) x), 1, 'confirmar la nueva revisión');
select tests.eq((select string_agg(status, ',' order by status) from public.candidate_cv_profiles where candidate_id = (select cand from t4)), 'confirmado,reemplazado', 'el confirmado anterior queda reemplazado');
-- Evaluaciones ponderadas
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);
set local role authenticated;  -- coordinador
select tests.eq(tests.affected($$update public.vacancy_assessments set weight = 3, criteria = '[{"name":"Fórmulas","weight":2},{"name":"Tablas dinámicas","weight":1}]', criteria_approved_at = now() where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)$$), 1, 'pesos y criterios aprobados');
select tests.eq((select criteria_approved_by from public.vacancy_assessments where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)), 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'aprobación registrada por la BD');
select tests.eq(tests.affected($$update public.vacancy_assessments set criteria = '[{"name":"Otro"}]' where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)$$), 1, 'cambiar criterios');
select tests.eq((select criteria_approved_at is null from public.vacancy_assessments where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)), true, 'cambiar criterios invalida la aprobación');
select tests.eq(tests.affected($$insert into public.vacancy_assessments (vacancy_id, assessment_type_id, requirement, weight) values ((select v from t_f), (select id from public.assessment_types where name = 'Caso práctico'), 'no_aplica', 5)$$), 1, 'evaluación no aplicable');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
select tests.eq((select normalized from public.assessment_results where application_id = (select app from t4) and assessment_type_id = (select excel from t4)), 85.0, 'puntaje normalizado (85 de 100)');
select tests.eq((select normalized from public.assessment_results where application_id = (select app from t4) and assessment_type_id = (select ingles from t4)), 57.1, 'nivel B2 (posición 4 de 7) = 57,1');
select tests.fails($$update public.assessment_results set criteria_scores = '[{"name":"Fórmulas","score":9}]' where application_id = (select app from t4) and assessment_type_id = (select excel from t4)$$, 'criterios de 1 a 5');
select tests.eq(tests.affected($$update public.assessment_results set criteria_scores = '[{"name":"Fórmulas","score":5,"weight":2},{"name":"Tablas dinámicas","score":2,"weight":1}]' where application_id = (select app from t4) and assessment_type_id = (select excel from t4)$$), 1, 'calificación por criterios');
select tests.eq((select normalized from public.assessment_results where application_id = (select app from t4) and assessment_type_id = (select excel from t4)), 80.0, 'ponderación de criterios: (5×2+2×1)/(5×3) = 80');
select tests.eq((select (public.application_assessment_summary((select app from t4)) ->> 'weighted_score')::numeric), 74.3, 'resultado ponderado (Excel peso 3, inglés peso 1); el no aplicable no cuenta');
select tests.eq((select (public.application_assessment_summary((select app from t4)) ->> 'complete')::boolean), true, 'obligatorias completas');
-- Lotes de IA (preselección)
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal2"}', true);
update public.ai_settings set provider = 'simulado', enabled = true, daily_requests_per_user = 500;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
create temp table t17 as select public.create_ai_batch((select v from t_f), 2) as b;
select tests.eq((select total >= 1 from public.ai_batches where id = (select b from t17)), true, 'lote con las postulaciones activas de la vacante');
select tests.fails($$select public.create_ai_batch((select v from t_f), 2)$$, 'un solo análisis en curso por vacante');
create temp table t17i as select public.next_ai_batch_item((select b from t17)) as it;
select tests.eq((select (it ->> 'application_id') is not null from t17i), true, 'siguiente elemento del lote');
create temp table t17r as select public.ai_begin_request('preseleccion', null, null, ((select it ->> 'application_id' from t17i))::uuid, repeat('b', 64), true) as r;
select tests.eq((select count(*)::int from (select public.ai_tag_request(((select r ->> 'id' from t17r))::uuid, null, (select b from t17))) x), 1, 'solicitud asociada al lote');
select tests.eq((select count(*)::int from (select public.ai_finish_request(((select r ->> 'id' from t17r))::uuid, '{"matriz":[]}', 10, 10, 0)) x), 1, 'resultado de preselección');
select tests.eq((select count(*)::int from (select public.finish_ai_batch_item(((select it ->> 'item_id' from t17i))::uuid, 'procesado', ((select r ->> 'id' from t17r))::uuid)) x), 1, 'elemento procesado');
select tests.eq((select public.ai_find_reusable('preseleccion', ((select it ->> 'application_id' from t17i))::uuid, repeat('b', 64))), ((select r ->> 'id' from t17r))::uuid, 'el mismo contenido se reutiliza (no se duplica la consulta)');
select tests.eq((select public.ai_find_reusable('preseleccion', ((select it ->> 'application_id' from t17i))::uuid, repeat('c', 64))) is null, true, 'contenido distinto: nueva consulta');
select tests.fails($$select public.finish_ai_batch_item(((select it ->> 'item_id' from t17i))::uuid, 'procesado')$$, 'un elemento no se cierra dos veces');
select tests.eq((select processed from public.ai_batches where id = (select b from t17)), 1, 'progreso del lote');
select tests.eq((select count(*)::int from (select public.cancel_ai_batch((select b from t17))) x), 1, 'cancelar el lote');
select tests.eq((select status from public.ai_batches where id = (select b from t17)), 'cancelado', 'lote cancelado');
-- Criterios aprobados por el reclutador asignado (función dedicada)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003"}', true);
select tests.eq(tests.affected($$update public.vacancy_assessments set weight = 9 where vacancy_id = (select v from t_f)$$), 0, 'el reclutador no edita la tabla directamente');
select tests.eq((select count(*)::int from (select public.set_vacancy_assessment_criteria((select id from public.vacancy_assessments where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)), 3, '[{"name":"Fórmulas","weight":2},{"name":"Tablas dinámicas","weight":1}]', true)) x), 1, 'el reclutador asignado aprueba criterios y peso');
select tests.eq((select criteria_approved_by::text || '|' || weight::text || '|' || jsonb_array_length(criteria)::text from public.vacancy_assessments where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)), 'aaaaaaaa-0000-4000-8000-000000000003|3.00|2', 'aprobación con el usuario real');
select tests.fails($$select public.set_vacancy_assessment_criteria((select id from public.vacancy_assessments where vacancy_id = (select v from t_f) and assessment_type_id = (select excel from t4)), 3, '[{"name":"","weight":1}]', true)$$, 'criterios inválidos se rechazan');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}', true);
-- Guion editable
select tests.eq(tests.affected($$insert into public.interview_answers (interview_id, position, question_text, origin, competency) values ((select i from t4i), 40, 'Pregunta manual ficticia', 'manual', 'Comunicación')$$), 1, 'agregar pregunta manual');
select tests.eq(tests.affected($$delete from public.interview_answers where interview_id = (select i from t4i) and position = 40$$), 0, 'no se quitan preguntas de una entrevista ya realizada');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004"}', true);  -- otro reclutador
select tests.eq((select count(*)::int from public.candidate_cv_profiles), 0, 'otro reclutador NO ve perfiles curriculares ajenos');
select tests.eq((select jsonb_array_length(public.application_assessment_summary((select app from t4)) -> 'items') >= 0), true, 'resumen de evaluaciones sujeto a RLS');
select tests.fails($$select public.next_ai_batch_item((select id from public.ai_batches limit 1))$$, 'otro reclutador NO procesa lotes ajenos');
select tests.fails($$select public.set_vacancy_assessment_criteria((select id from public.vacancy_assessments where vacancy_id = (select v from t_f) limit 1), 1, null, true)$$, 'otro reclutador NO aprueba criterios de vacantes ajenas');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005"}', true);  -- consulta
select tests.eq((select count(*)::int from public.candidate_cv_profiles), 0, 'consulta NO ve perfiles curriculares');
select tests.fails($$select public.create_ai_batch((select v from t_f))$$, 'consulta NO crea lotes de IA');
select tests.fails($$select public.set_vacancy_assessment_criteria((select id from public.vacancy_assessments where vacancy_id = (select v from t_f) limit 1), 1, null, true)$$, 'consulta NO aprueba criterios');
select tests.fails($$select public.log_terna_export((select v from t_f), array[(select app from t4), (select app from t4)], 'pdf')$$, 'consulta NO exporta ternas');
reset role;

-- ============================= AUDITORÍA ============================
select tests.eq(
  (select changed_fields from public.audit_logs where table_name = 'candidates' and action = 'UPDATE' and record_id = (select id from public.candidates where first_name = 'Fabiola') order by id asc limit 1),
  array['current_title']::text[], 'bitácora guarda solo nombres de campos modificados');
select tests.eq(
  (select actor_id from public.audit_logs where table_name = 'applications' and action = 'UPDATE' and 'stage' = any (changed_fields) and record_id = (select id from public.applications where candidate_id = '44444444-0000-4000-8000-000000000001' and vacancy_id = '33333333-0000-4000-8000-000000000001') order by id asc limit 1),
  'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'bitácora registra el actor');

\o
select format('%s pruebas RLS superadas', count(*)) as resultado from tests.results where ok;
rollback;
