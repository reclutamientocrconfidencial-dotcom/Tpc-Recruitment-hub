-- =====================================================================
-- Verificación de la migración 1500 — Fase 6: Mi jornada (solo lectura).
-- =====================================================================
select 'tareas con RLS forzado' as control,
       (select case when relrowsecurity and relforcerowsecurity then 'ok' else 'FALLA' end from pg_class where oid = 'public.tasks'::regclass) as resultado, 'ok' as esperado
union all
select 'tokens de calendario fuera de la API (esquema privado)',
       case when has_table_privilege('authenticated', 'private.calendar_tokens', 'select') or has_table_privilege('anon', 'private.calendar_tokens', 'select')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'feed de calendario: solo anon (la app sin sesión, con el enlace secreto)',
       case when has_function_privilege('anon', 'public.calendar_feed(text)', 'execute')
             and not has_function_privilege('authenticated', 'public.calendar_feed(text)', 'execute') then 'ok' else 'FALLA' end, 'ok'
union all
select 'indicadores de productividad sin acceso anónimo',
       case when has_function_privilege('anon', 'public.productivity_indicators(date,date)', 'execute') then 'FALLA' else 'ok' end, 'ok'
union all
select 'tareas sin borrado (se cancelan)',
       case when has_table_privilege('authenticated', 'public.tasks', 'delete') then 'FALLA' else 'ok' end, 'ok';
