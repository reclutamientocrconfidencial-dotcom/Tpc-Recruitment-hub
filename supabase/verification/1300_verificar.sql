-- =====================================================================
-- Verificación de la migración 1300 — Fase 4 (solo lectura).
-- Ejecutar en el SQL Editor del proyecto TEST después de aplicar 1300.
-- =====================================================================
select 'tablas nuevas con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 10' as resultado, '10 de 10' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('interview_questions', 'assessment_types', 'credential_types', 'vacancy_assessments', 'assessment_results',
                    'interviews', 'interview_answers', 'candidate_credentials', 'report_templates', 'executive_reports')
union all
select 'anon sin acceso a tablas nuevas',
       case when exists (select 1 from unnest(array['interviews', 'assessment_results', 'candidate_credentials', 'executive_reports', 'report_templates']) t
                         where has_table_privilege('anon', 'public.' || t, 'select')) then 'FALLA' else 'ok' end, 'ok'
union all
select 'catálogos iniciales (evaluaciones / credenciales / preguntas)',
       (select count(*) from public.assessment_types)::text || ' / ' || (select count(*) from public.credential_types)::text || ' / ' || (select count(*) from public.interview_questions)::text,
       '≥5 / ≥8 / ≥4'
union all
select 'una plantilla de informe vigente', (select count(*) from public.report_templates where is_active)::text, '1'
union all
select 'triggers de reglas (resultados, entrevistas, credenciales, informes)', count(*)::text || ' de 5', '5 de 5'
from pg_trigger where not tgisinternal and tgname in ('assessment_results_rules', 'interviews_rules', 'interviews_seed_questions', 'candidate_credentials_rules', 'executive_reports_rules')
union all
select 'exportación de informes sin acceso anónimo',
       case when has_function_privilege('anon', 'public.log_report_export(uuid,text)', 'execute') then 'FALLA' else 'ok' end, 'ok'
union all
select 'bucket acepta respaldos JPG/PNG',
       coalesce((select case when 'image/png' = any (allowed_mime_types) then 'ok' else 'FALLA' end from storage.buckets where id = 'curriculums'), 'FALTA (aplique 1200)'), 'ok';
