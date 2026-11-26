-- =====================================================================
-- Verificación de la migración 1400 — Fase 5: IA (solo lectura).
-- =====================================================================
select 'tablas de IA con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 2' as resultado, '2 de 2' as esperado
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('ai_settings', 'ai_requests')
union all
select 'IA apagada o con proveedor simulado (sin autorización de costos)',
       (select case when not enabled or provider = 'simulado' then 'ok' else 'REVISAR: proveedor externo activo' end from public.ai_settings), 'ok'
union all
select 'proveedor externo solo con acuerdo y presupuesto',
       (select case when provider <> 'anthropic' or not enabled or (dpa_confirmed and monthly_budget_usd > 0) then 'ok' else 'FALLA' end from public.ai_settings), 'ok'
union all
select 'registro de IA: solo lectura desde la API',
       case when has_table_privilege('authenticated', 'public.ai_requests', 'insert') or has_table_privilege('authenticated', 'public.ai_requests', 'update')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'funciones de IA sin acceso anónimo',
       case when has_function_privilege('anon', 'public.ai_begin_request(text,uuid,uuid,uuid,text,boolean)', 'execute')
              or has_function_privilege('anon', 'public.ai_usage_summary()', 'execute') then 'FALLA' else 'ok' end, 'ok';
