-- =====================================================================
-- Verificación de la migración 1000 — Fase 2C (solo lectura).
-- =====================================================================
select 'tablas nuevas con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 9' as resultado, '9 de 9' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname in
  ('cr_cantons', 'consent_texts', 'candidate_consents', 'candidate_private', 'candidate_profiles',
   'candidate_duplicate_dismissals', 'import_batches', 'import_rows', 'security_settings')
union all
select 'candidate_private sin acceso directo desde la API',
       case when has_table_privilege('authenticated', 'public.candidate_private', 'select')
              or has_table_privilege('authenticated', 'public.candidate_private', 'insert')
              or has_table_privilege('anon', 'public.candidate_private', 'select')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'datos sensibles fuera de la tabla candidates',
       count(*)::text, '0'
from public.candidates where national_id is not null or email is not null or phone is not null or expected_salary is not null or notes is not null
union all
select 'candidatos sin consentimiento vigente (activos)',
       count(*)::text, '0'
from public.candidates c
where c.status = 'activo' and not exists (select 1 from public.candidate_consents k where k.candidate_id = c.id and k.revoked_at is null)
union all
select 'versión vigente del consentimiento', count(*)::text, '1' from public.consent_texts where is_active
union all
select 'cantones de Costa Rica', count(*)::text, '84' from public.cr_cantons
union all
select 'datos reales habilitados', (select case when real_data_enabled then 'sí' else 'no' end from public.security_settings limit 1), 'no'
union all
select 'restricción «consentimiento obligatorio»',
       case when exists (select 1 from pg_trigger where tgname = 'candidates_require_consent' and tgdeferrable) then 'ok' else 'FALLA' end, 'ok'
union all
select 'funciones de 2C sin acceso anónimo',
       case when has_function_privilege('anon', 'public.get_candidate_private(uuid,text)', 'execute')
              or has_function_privilege('anon', 'public.save_candidate(uuid,jsonb)', 'execute')
              or has_function_privilege('anon', 'public.import_batch_commit(uuid)', 'execute')
            then 'FALLA' else 'ok' end, 'ok';
