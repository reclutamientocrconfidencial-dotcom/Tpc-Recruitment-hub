-- =====================================================================
-- TPC Recruitment Hub — Fase 8: comprobación de salud de la base de datos.
-- Migración 1800 (incremental y compatible).
--   Función mínima que el monitoreo llama sin sesión para confirmar que la
--   base responde (y mantener activo un proyecto Supabase gratuito).
--   No lee tablas ni devuelve datos: solo «true».
-- Verificación: supabase/verification/1800_verificar.sql
-- Reversión:    docs/OPERACION.md §5
-- =====================================================================
create or replace function public.salud()
returns boolean language sql stable security invoker set search_path = '' as $$
  select true
$$;
comment on function public.salud() is 'Comprobación de salud para el monitoreo: no accede a tablas ni devuelve datos.';
revoke all on function public.salud() from public;
grant execute on function public.salud() to anon, authenticated;
