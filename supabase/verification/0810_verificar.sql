-- =====================================================================
-- Verificación de la migración 0810 (solo lectura; no modifica nada).
-- =====================================================================
select 'catálogos con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 5' as resultado,
       '5 de 5' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('stage_catalog', 'job_positions', 'proficiency_scales', 'proficiency_levels', 'requirement_catalog')
union all
select 'catálogos sin permiso DELETE ni acceso anónimo',
       case when bool_or(has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('anon', c.oid, 'select'))
            then 'FALLA' else 'ok' end,
       'ok'
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('stage_catalog', 'job_positions', 'proficiency_scales', 'proficiency_levels', 'requirement_catalog')
union all
select 'etapas en el catálogo', count(*)::text, '14 o más' from public.stage_catalog
union all
select 'etapas de procesos enlazadas al catálogo',
       count(*) filter (where catalog_stage_id is not null)::text || ' de ' || count(*)::text,
       'todas'
from public.pipeline_stages
union all
select 'escalas de dominio', count(*)::text, '4 o más' from public.proficiency_scales
union all
select 'requisitos en el catálogo', count(*)::text, '12 o más' from public.requirement_catalog
union all
select 'puestos en el catálogo', count(*)::text, '10 o más' from public.job_positions
union all
select 'funciones nuevas',
       (case when to_regprocedure('public.duplicate_pipeline_template(uuid,uuid,uuid,uuid,text)') is not null then 1 else 0 end
      + case when to_regprocedure('public.copy_requirement_templates(uuid,uuid,uuid,uuid)') is not null then 1 else 0 end
      + case when to_regprocedure('public.resolve_pipeline_template(uuid,uuid,uuid)') is not null then 1 else 0 end)::text || ' de 3',
       '3 de 3';
