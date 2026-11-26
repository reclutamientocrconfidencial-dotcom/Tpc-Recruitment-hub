-- =====================================================================
-- Verificación de la migración 1700 — Mejoras de evaluación e IA (solo lectura).
-- Ejecute en el SQL Editor del proyecto TEST. Todas las filas deben mostrar
-- el valor de la columna «esperado» (las informativas solo describen).
-- =====================================================================
select 'tablas nuevas' as control, count(*)::text || ' de 3' as resultado, '3 de 3' as esperado
from pg_tables where schemaname = 'public' and tablename in ('candidate_cv_profiles', 'ai_batches', 'ai_batch_items')
union all
select 'RLS habilitado y forzado en tablas nuevas',
       (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('candidate_cv_profiles', 'ai_batches', 'ai_batch_items') and c.relrowsecurity and c.relforcerowsecurity) || ' de 3', '3 de 3'
union all
select 'sin privilegios para anon en tablas nuevas',
       case when exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
                         and table_name in ('candidate_cv_profiles', 'ai_batches', 'ai_batch_items')) then 'FALLA' else 'ok' end, 'ok'
union all
select 'funciones nuevas', count(*)::text || ' de 11', '11 de 11'
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('confirm_cv_profile', 'ai_tag_request', 'ai_find_reusable', 'create_ai_batch', 'next_ai_batch_item', 'finish_ai_batch_item',
                  'cancel_ai_batch', 'application_assessment_summary', 'log_terna_export', 'set_vacancy_assessment_criteria', 'ai_begin_request')
union all
select 'funciones nuevas sin acceso anónimo',
       case when has_function_privilege('anon', 'public.confirm_cv_profile(uuid,boolean)', 'execute')
              or has_function_privilege('anon', 'public.create_ai_batch(uuid,numeric)', 'execute')
              or has_function_privilege('anon', 'public.log_terna_export(uuid,uuid[],text)', 'execute')
              or has_function_privilege('anon', 'public.set_vacancy_assessment_criteria(uuid,numeric,jsonb,boolean)', 'execute') then 'FALLA' else 'ok' end, 'ok'
union all
select 'nuevas funciones de IA admitidas',
       case when pg_get_constraintdef(oid) like '%preseleccion%' and pg_get_constraintdef(oid) like '%conclusiones_entrevista%' then 'ok' else 'FALLA' end, 'ok'
from pg_constraint where conname = 'ai_requests_feature_check'
union all
select 'columnas nuevas (guion, ponderación, criterios, normalizado)',
       (select count(*)::text from information_schema.columns where table_schema = 'public' and (
          (table_name = 'interview_answers' and column_name in ('origin', 'competency', 'objective')) or
          (table_name = 'vacancy_assessments' and column_name in ('weight', 'criteria', 'criteria_approved_by', 'criteria_approved_at')) or
          (table_name = 'assessment_results' and column_name in ('criteria_scores', 'normalized')) or
          (table_name = 'assessment_types' and column_name in ('kind', 'criteria')) or
          (table_name = 'ai_requests' and column_name in ('batch_id', 'interview_id')))) || ' de 13', '13 de 13'
union all
select 'disparadores de reglas',
       (select count(*)::text from pg_trigger where not tgisinternal and tgname in ('cv_profiles_rules', 'vacancy_assessments_rules', 'assessment_results_normalized')) || ' de 3', '3 de 3'
union all
select 'tipos de evaluación nuevos', (select count(*)::text from public.assessment_types where name in ('Entrevista por competencias', 'Prueba técnica', 'Caso práctico', 'Assessment center', 'Verificación de referencias')) || ' de 5', '5 de 5'
union all
select 'plantilla de informe v2 creada', (select count(*)::text from public.report_templates where version = '2026-2'), '1'
union all
select 'plantilla vigente', coalesce((select version from public.report_templates where is_active limit 1), 'ninguna'), 'informativo (2026-2 si la anterior era provisional)'
union all
select 'datos reales habilitados', coalesce((select case when real_data_enabled then 'SÍ' else 'no' end from public.security_settings limit 1), 'no'), 'no'
union all
select 'IA: proveedor configurado', coalesce((select provider from public.ai_settings limit 1), '—'), 'informativo (simulado en TEST)';
