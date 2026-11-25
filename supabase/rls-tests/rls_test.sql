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
-- Endurecimiento (migración 0700)
select tests.eq(tests.affected($$insert into public.candidates (first_name, last_name, owner_id, created_by) values ('Gabriel', 'Suplantador Ficticio', 'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002')$$), 1, 'alta con created_by ajeno se acepta...');
select tests.eq((select created_by from public.candidates where first_name = 'Gabriel'), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, '...pero created_by se fuerza al usuario real (no suplantable)');
select tests.eq(tests.affected($$update public.candidates set created_by = 'aaaaaaaa-0000-4000-8000-000000000002' where first_name = 'Gabriel'$$), 1, 'intento de cambiar created_by...');
select tests.eq((select created_by from public.candidates where first_name = 'Gabriel'), 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, '...created_by es inmutable');
select tests.fails($$update public.applications set vacancy_id = '33333333-0000-4000-8000-000000000002' where candidate_id = '44444444-0000-4000-8000-000000000001'$$, 'reclutador NO mueve postulaciones a vacantes no asignadas');
select tests.fails($$update public.vacancies set requisition_id = '22222222-0000-4000-8000-000000000002' where id = '33333333-0000-4000-8000-000000000001'$$, 'reclutador NO mueve su vacante a otra requisición');
select tests.eq(tests.affected($$update public.vacancies set openings = 2 where id = '33333333-0000-4000-8000-000000000001'$$), 1, 'reclutador sí edita su vacante asignada');
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
