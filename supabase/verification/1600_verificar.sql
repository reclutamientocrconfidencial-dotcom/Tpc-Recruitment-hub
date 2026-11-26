-- =====================================================================
-- Verificación de la migración 1600 — Fase 7: indicadores (solo lectura).
-- =====================================================================
select 'funciones de indicadores' as control, count(*)::text || ' de 7' as resultado, '7 de 7' as esperado
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('analytics_summary', 'analytics_funnel', 'analytics_stage_times', 'analytics_sources', 'analytics_recruiters', 'analytics_clients', 'export_dataset')
union all
select 'indicadores y exportaciones sin acceso anónimo',
       case when has_function_privilege('anon', 'public.analytics_summary(date,date,uuid)', 'execute')
              or has_function_privilege('anon', 'public.export_dataset(text,text,date,date,uuid)', 'execute') then 'FALLA' else 'ok' end, 'ok'
union all
select 'exportaciones registradas (histórico)', (select count(*)::text from public.access_logs where action = 'exportar' and resource like 'exportacion_%'), 'informativo';
