-- =====================================================================
-- Datos de prueba 100 % FICTICIOS para desarrollo local.
-- Ninguna persona, empresa, cédula, correo ni teléfono corresponde a la realidad.
-- Dominios de correo: .test (reservado, RFC 2606).
-- =====================================================================

insert into public.clients (id, name, legal_id, industry, status, contact_name, contact_email, contact_phone, province)
values
  ('11111111-0000-4000-8000-000000000001', 'Comercializadora Ficticia del Valle S.A.', '3-101-000001', 'Comercio', 'activo', 'Ana Prueba Solís', 'ana.prueba@valle-ficticio.test', '+506 2000-0001', 'San José'),
  ('11111111-0000-4000-8000-000000000002', 'Logística Imaginaria CR S.R.L.', '3-102-000002', 'Logística', 'activo', 'Luis Ejemplo Mora', 'luis.ejemplo@logistica-imaginaria.test', '+506 2000-0002', 'Heredia'),
  ('11111111-0000-4000-8000-000000000003', 'Servicios Demo Guanacaste S.A.', '3-101-000003', 'Turismo', 'prospecto', 'María Muestra Vargas', 'maria.muestra@demo-gte.test', '+506 2000-0003', 'Guanacaste');

insert into public.requisitions (id, client_id, title, department, positions_count, priority, status, requested_by_name, salary_min, salary_max, currency, target_date)
values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Ejecutivo(a) de ventas', 'Comercial', 3, 'alta', 'en_proceso', 'Ana Prueba Solís', 600000, 850000, 'CRC', current_date + 30),
  ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'Analista de inventarios', 'Operaciones', 1, 'media', 'aprobada', 'Luis Ejemplo Mora', 750000, 950000, 'CRC', current_date + 45),
  ('22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000003', 'Recepcionista bilingüe', 'Hospedaje', 2, 'urgente', 'pendiente_aprobacion', 'María Muestra Vargas', 1200, 1500, 'USD', current_date + 15);

insert into public.vacancies (id, requisition_id, title, description, province, modality, employment_type, status, openings, salary_min, salary_max, currency, published_at)
values
  ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'Ejecutivo(a) de ventas corporativas', 'Vacante ficticia para pruebas.', 'San José', 'hibrido', 'tiempo_completo', 'abierta', 3, 600000, 850000, 'CRC', now() - interval '5 days'),
  ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'Analista de inventarios', 'Vacante ficticia para pruebas.', 'Heredia', 'presencial', 'tiempo_completo', 'borrador', 1, 750000, 950000, 'CRC', null);

insert into public.candidates (id, first_name, last_name, national_id, email, phone, province, canton, current_title, years_experience, expected_salary, currency, english_level, source, consent_given, consent_at)
values
  ('44444444-0000-4000-8000-000000000001', 'Carlos', 'Ficticio Rojas', '0-0000-0001', 'carlos.ficticio@correo.test', '+506 8000-0001', 'San José', 'Escazú', 'Asesor comercial', 4, 750000, 'CRC', 'B2', 'Referido', true, now()),
  ('44444444-0000-4000-8000-000000000002', 'Daniela', 'Inventada Castro', '0-0000-0002', 'daniela.inventada@correo.test', '+506 8000-0002', 'Heredia', 'Belén', 'Analista de logística', 6, 900000, 'CRC', 'C1', 'Portal de empleo', true, now()),
  ('44444444-0000-4000-8000-000000000003', 'Esteban', 'Simulado Jiménez', '0-0000-0003', 'esteban.simulado@correo.test', '+506 8000-0003', 'Alajuela', 'Grecia', 'Vendedor', 2, 650000, 'CRC', 'B1', 'LinkedIn', true, now());

insert into public.applications (vacancy_id, candidate_id, stage, rating)
values
  ('33333333-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000001', 'entrevista', 4),
  ('33333333-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000003', 'preseleccion', 3);
