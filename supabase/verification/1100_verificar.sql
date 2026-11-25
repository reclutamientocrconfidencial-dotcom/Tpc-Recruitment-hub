-- =====================================================================
-- Verificación de la migración 1100 — Fase 2D (solo lectura).
-- =====================================================================
select 'tablas nuevas con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 4' as resultado, '4 de 4' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('vacancy_stages', 'application_events', 'application_notes', 'application_requirement_checks')
union all
select 'postulaciones sin etapa de su vacante', count(*)::text, '0' from public.applications where stage_id is null
union all
select 'postulaciones descartadas sin motivo',
       count(*)::text, '0'
from public.applications a join public.vacancy_stages s on s.id = a.stage_id
where s.category = 'descartado' and a.discard_reason is null
union all
select 'triggers de reglas e historial', count(*)::text || ' de 3', '3 de 3'
from pg_trigger where not tgisinternal and tgname in ('applications_rules', 'applications_after', 'application_notes_event')
union all
select 'historial: solo lectura desde la API',
       case when has_table_privilege('authenticated', 'public.application_events', 'insert')
              or has_table_privilege('authenticated', 'public.application_events', 'update')
              or has_table_privilege('authenticated', 'public.application_events', 'delete')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'funciones de 2D sin acceso anónimo',
       case when has_function_privilege('anon', 'public.create_application(uuid,uuid,text)', 'execute')
              or has_function_privilege('anon', 'public.move_application(uuid,uuid,text,text)', 'execute')
            then 'FALLA' else 'ok' end, 'ok';
