-- =====================================================================
-- Verificación de la migración 0840 (solo lectura; no modifica nada).
-- =====================================================================
select 'funciones de plazas' as control,
       (case when to_regprocedure('private.vacancy_committed_openings(public.vacancy_status,integer,integer)') is not null then 1 else 0 end
      + case when to_regprocedure('private.requisition_committed_openings(uuid,uuid)') is not null then 1 else 0 end
      + case when to_regprocedure('private.requisition_positions_guard()') is not null then 1 else 0 end)::text || ' de 3' as resultado,
       '3 de 3' as esperado
union all
select 'trigger de plazas autorizadas en requisiciones', count(*)::text || ' de 1', '1 de 1'
from pg_trigger where not tgisinternal and tgname = 'requisitions_positions_guard'
union all
select 'reglas de vacantes validan plazas',
       case when pg_get_functiondef('private.vacancy_rules()'::regprocedure) like '%Plazas insuficientes%' then 'ok' else 'FALLA' end, 'ok'
union all
select 'funciones no invocables por usuarios',
       case when has_function_privilege('authenticated', 'private.requisition_committed_openings(uuid,uuid)', 'execute')
              or has_function_privilege('authenticated', 'private.vacancy_committed_openings(public.vacancy_status,integer,integer)', 'execute')
            then 'FALLA' else 'ok' end, 'ok'
union all
-- Informativo: requisiciones que YA exceden sus plazas (datos previos a 0840). No bloquea nada;
-- revise y ajuste manualmente si aparece alguna. En TEST con datos ficticios, el valor esperado suele ser 0.
select 'requisiciones con plazas comprometidas por encima de las autorizadas (informativo)',
       count(*)::text, '0'
from public.requisitions r
where private.requisition_committed_openings(r.id, null) > r.positions_count;
