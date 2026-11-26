-- =====================================================================
-- Verificación de la migración 0830 (solo lectura; no modifica nada).
-- =====================================================================
select 'tabla de historial' as control,
       case when to_regclass('public.requirement_catalog_history') is not null then 'ok' else 'FALLA' end as resultado,
       'ok' as esperado
union all
select 'historial con RLS forzado',
       case when c.relrowsecurity and c.relforcerowsecurity then 'ok' else 'FALLA' end, 'ok'
from pg_class c where c.oid = 'public.requirement_catalog_history'::regclass
union all
select 'historial: solo lectura desde la API',
       case when has_table_privilege('authenticated', 'public.requirement_catalog_history', 'insert')
              or has_table_privilege('authenticated', 'public.requirement_catalog_history', 'update')
              or has_table_privilege('authenticated', 'public.requirement_catalog_history', 'delete')
              or has_table_privilege('anon', 'public.requirement_catalog_history', 'select')
            then 'FALLA' else 'ok' end,
       'ok'
union all
select 'triggers del catálogo', count(*)::text || ' de 2', '2 de 2'
from pg_trigger
where not tgisinternal and tgname in ('requirement_catalog_guard_scale', 'requirement_catalog_after_update')
union all
select 'funciones de trigger no invocables',
       case when has_function_privilege('authenticated', 'private.requirement_catalog_after_update()', 'execute')
              or has_function_privilege('authenticated', 'private.requirement_catalog_guard_scale()', 'execute')
            then 'FALLA' else 'ok' end,
       'ok'
union all
select 'requisitos configurados con nombre distinto al catálogo',
       count(*)::text, '0'
from public.requirement_templates t
join public.requirement_catalog c on c.id = t.catalog_requirement_id
where t.requirement is distinct from c.name;
