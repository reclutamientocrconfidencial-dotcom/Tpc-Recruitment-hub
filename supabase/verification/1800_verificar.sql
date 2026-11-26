-- Verificación de la migración 1800 — Fase 8: salud (solo lectura).
select 'función de salud' as control, count(*)::text as resultado, '1' as esperado
from pg_proc where pronamespace = 'public'::regnamespace and proname = 'salud' and not prosecdef
union all
select 'ejecutable sin sesión (monitoreo)', case when has_function_privilege('anon', 'public.salud()', 'execute') then 'ok' else 'FALLA' end, 'ok'
union all
select 'responde', case when public.salud() then 'ok' else 'FALLA' end, 'ok';
