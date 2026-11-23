-- =====================================================================
-- Verificación de la migración 0800 (solo lectura; no modifica nada).
-- Ejecutar en el SQL Editor DESPUÉS de aplicar la migración.
-- =====================================================================
select 'tablas con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 4' as resultado,
       '4 de 4' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('intake_channels', 'pipeline_templates', 'pipeline_stages', 'requirement_templates')
union all
select 'anónimo sin acceso',
       case when bool_or(has_table_privilege('anon', c.oid, 'select')) then 'FALLA' else 'ok' end,
       'ok'
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('intake_channels', 'pipeline_templates', 'pipeline_stages', 'requirement_templates')
union all
select 'políticas nuevas',
       count(*)::text,
       '15'
from pg_policies
where schemaname = 'public'
  and tablename in ('intake_channels', 'pipeline_templates', 'pipeline_stages', 'requirement_templates')
union all
select 'fuentes de recepción', count(*)::text, '12 (o más si ya agregó)' from public.intake_channels
union all
select 'etapas del proceso estándar',
       count(*)::text,
       '8'
from public.pipeline_stages s
join public.pipeline_templates t on t.id = s.template_id
where t.client_id is null and t.is_default
union all
select 'función save_pipeline_stages',
       case when to_regprocedure('public.save_pipeline_stages(uuid,jsonb)') is not null then 'ok' else 'FALLA' end,
       'ok';
