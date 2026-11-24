-- =====================================================================
-- Verificación de la migración 0820 (solo lectura; no modifica nada).
-- =====================================================================
select 'columnas nuevas en requisiciones' as control,
       count(*)::text || ' de 4' as resultado, '4 de 4' as esperado
from information_schema.columns
where table_schema = 'public' and table_name = 'requisitions'
  and column_name in ('position_id', 'work_schedule', 'province', 'modality')
union all
select 'columnas nuevas en vacantes', count(*)::text || ' de 5', '5 de 5'
from information_schema.columns
where table_schema = 'public' and table_name = 'vacancies'
  and column_name in ('position_id', 'work_schedule', 'priority', 'filled_count', 'source_vacancy_id')
union all
select 'triggers de flujo', count(*)::text || ' de 3', '3 de 3'
from pg_trigger
where not tgisinternal
  and tgname in ('requisitions_status_rules', 'vacancies_rules', 'vacancies_mark_requisition_in_progress')
union all
select 'funciones nuevas',
       (case when to_regprocedure('public.load_vacancy_requirements(uuid)') is not null then 1 else 0 end
      + case when to_regprocedure('public.duplicate_vacancy(uuid,uuid)') is not null then 1 else 0 end)::text || ' de 2',
       '2 de 2'
union all
select 'funciones sin acceso anónimo',
       case when has_function_privilege('anon', 'public.load_vacancy_requirements(uuid)', 'execute')
              or has_function_privilege('anon', 'public.duplicate_vacancy(uuid,uuid)', 'execute')
            then 'FALLA' else 'ok' end,
       'ok'
union all
select 'trigger de requisiciones puede validar transiciones',
       case when has_function_privilege('authenticated', 'private.requisition_transition_allowed(public.requisition_status,public.requisition_status)', 'execute')
            then 'ok' else 'FALLA' end,
       'ok'
union all
select 'RLS forzado en requisiciones y vacantes',
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 2', '2 de 2'
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname in ('requisitions', 'vacancies')
union all
select 'vacantes con plazas cubiertas fuera de rango',
       count(*)::text, '0'
from public.vacancies where filled_count < 0 or filled_count > openings;
