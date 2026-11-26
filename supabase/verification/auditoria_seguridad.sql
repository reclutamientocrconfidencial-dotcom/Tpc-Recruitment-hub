-- =====================================================================
-- Auditoría de seguridad de la base de datos (SOLO LECTURA).
-- Ejecútela en el SQL Editor de TEST y de PRODUCCIÓN antes de cada despliegue
-- y trimestralmente. Toda fila de control debe mostrar «ok»; las informativas
-- listan lo que una persona debe revisar.
-- =====================================================================
with
tablas as (
  select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
definer_sin_path as (
  select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
),
anon_funcs as (
  select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and has_function_privilege('anon', p.oid, 'execute')
)
select 'tablas de public con RLS habilitado y forzado' as control,
       case when exists (select 1 from tablas where not (relrowsecurity and relforcerowsecurity))
            then 'FALLA: ' || (select string_agg(relname, ', ') from tablas where not (relrowsecurity and relforcerowsecurity)) else 'ok' end as resultado
union all
select 'anon sin privilegios sobre tablas de public',
       coalesce('FALLA: ' || (select string_agg(distinct table_name, ', ') from information_schema.role_table_grants
                              where grantee = 'anon' and table_schema = 'public'), 'ok')
union all
select 'funciones SECURITY DEFINER con search_path fijo',
       coalesce('FALLA: ' || (select string_agg(f, ', ') from definer_sin_path), 'ok')
union all
select 'esquema private inaccesible para anon y authenticated',
       case when has_schema_privilege('anon', 'private', 'usage') then 'FALLA (anon)'
            when exists (select 1 from information_schema.role_table_grants where table_schema = 'private' and grantee in ('anon', 'authenticated')) then 'FALLA (tablas)'
            else 'ok' end
union all
select 'funciones públicas ejecutables sin sesión (solo las previstas)',
       coalesce('REVISAR: ' || (select string_agg(proname, ', ' order by proname) from anon_funcs
                                where proname not in ('submit_public_form', 'calendar_feed', 'salud',
                                                      'get_public_form', 'attach_submission_cv', 'can_upload_submission_cv')), 'ok')
union all
select 'previstas sin sesión (informativo)', (select string_agg(proname, ', ' order by proname) from anon_funcs)
union all
select 'buckets de almacenamiento privados',
       coalesce('FALLA: ' || (select string_agg(id, ', ') from storage.buckets where public), 'ok')
union all
select 'políticas dirigidas a anon o public (informativo)',
       coalesce((select string_agg(tablename || ': ' || policyname, ' · ') from pg_policies
                 where schemaname in ('public', 'storage') and roles && array['anon', 'public']::name[]), 'ninguna')
union all
select 'vistas en public (deben usar security_invoker)',
       coalesce('REVISAR: ' || (select string_agg(c.relname, ', ') from pg_class c where c.relnamespace = 'public'::regnamespace
                                and c.relkind = 'v' and not coalesce(c.reloptions::text like '%security_invoker=true%', false)), 'ok')
union all
select 'datos reales habilitados', coalesce((select case when real_data_enabled then 'SÍ (confirme la autorización)' else 'no' end from public.security_settings limit 1), 'no')
union all
select 'usuarios internos activos sin verificación en dos pasos (informativo)',
       (select count(*)::text from public.profiles p where p.is_active
          and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
union all
select 'administradores activos', (select count(*)::text from public.profiles where is_active and role = 'admin');
