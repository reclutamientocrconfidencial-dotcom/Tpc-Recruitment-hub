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
