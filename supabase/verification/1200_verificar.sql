-- =====================================================================
-- Verificación de la migración 1200 — Fase 3: recepción (solo lectura).
-- Ejecutar en el SQL Editor del proyecto TEST después de aplicar 1200.
-- =====================================================================
select 'tablas nuevas con RLS forzado' as control,
       count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text || ' de 6' as resultado, '6 de 6' as esperado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('public_forms', 'form_questions', 'form_links', 'intake_submissions', 'submission_answers', 'candidate_documents')
union all
select 'anon sin acceso directo a tablas nuevas',
       case when exists (select 1 from unnest(array['public_forms', 'form_questions', 'form_links', 'intake_submissions', 'submission_answers', 'candidate_documents']) t
                         where has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('anon', 'public.' || t, 'insert'))
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'envíos: solo lectura desde la API',
       case when has_table_privilege('authenticated', 'public.intake_submissions', 'insert')
              or has_table_privilege('authenticated', 'public.intake_submissions', 'update')
              or has_table_privilege('authenticated', 'public.candidate_documents', 'insert')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'envío público solo para anon (con clave del servidor)',
       case when has_function_privilege('anon', 'public.submit_public_form(text,text,jsonb,text)', 'execute')
             and not has_function_privilege('authenticated', 'public.submit_public_form(text,text,jsonb,text)', 'execute')
            then 'ok' else 'FALLA' end, 'ok'
union all
select 'revisión de envíos sin acceso anónimo',
       case when has_function_privilege('anon', 'public.review_submission(uuid,text,uuid,text)', 'execute')
              or has_function_privilege('anon', 'public.document_for_download(uuid)', 'execute')
            then 'FALLA' else 'ok' end, 'ok'
union all
select 'clave de formularios configurada (ver OPERACION §9)',
       case when exists (select 1 from private.public_form_settings) then 'ok' else 'PENDIENTE' end, 'ok'
union all
select 'bucket «curriculums» privado (5 MB, PDF/DOCX)',
       coalesce((select case when not public and file_size_limit = 5242880 and cardinality(allowed_mime_types) = 2 then 'ok' else 'FALLA' end
                 from storage.buckets where id = 'curriculums'), 'FALTA'), 'ok'
union all
select 'políticas de almacenamiento de currículums', count(*)::text || ' de 4', '4 de 4'
from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'curriculums:%';
