-- =====================================================================
-- Verificación de la migración 0900 — Puerta S1 (solo lectura).
-- =====================================================================
select 'configuración de seguridad (fila única)' as control,
       count(*)::text as resultado, '1' as esperado
from public.security_settings
union all
select 'exigencia de MFA (inicia desactivada)',
       (select case when mfa_required then 'activada' else 'desactivada' end from public.security_settings limit 1), 'desactivada'
union all
select 'autorización central exige MFA cuando corresponde',
       case when pg_get_functiondef('private.current_app_role()'::regprocedure) like '%mfa_satisfied%' then 'ok' else 'FALLA' end, 'ok'
union all
select 'registro de accesos: solo lectura desde la API',
       case when has_table_privilege('authenticated', 'public.access_logs', 'insert')
              or has_table_privilege('authenticated', 'public.access_logs', 'update')
              or has_table_privilege('authenticated', 'public.access_logs', 'delete')
              or has_table_privilege('anon', 'public.access_logs', 'select')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'funciones de S1 sin acceso anónimo',
       case when has_function_privilege('anon', 'public.log_access(text,text,uuid,text,integer)', 'execute')
              or has_function_privilege('anon', 'public.users_mfa_status()', 'execute')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'todas las tablas de public con RLS forzado',
       count(*) filter (where not (c.relrowsecurity and c.relforcerowsecurity))::text || ' sin forzar', '0 sin forzar'
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
union all
select 'tablas de public con privilegios para anon',
       count(*)::text, '0'
from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon';
