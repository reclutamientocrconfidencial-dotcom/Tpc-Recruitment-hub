-- =====================================================================
-- TPC Recruitment Hub — Fase 1
-- Migración 0100: extensiones, esquema privado, tipos enumerados y utilidades
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Esquema privado: NO se expone por la API REST de Supabase.
-- Aloja funciones auxiliares usadas por las políticas RLS.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Roles de aplicación (permisos por usuario)
create type public.app_role as enum ('admin', 'coordinador', 'reclutador', 'consulta');

create type public.client_status as enum ('prospecto', 'activo', 'inactivo');
create type public.priority_level as enum ('baja', 'media', 'alta', 'urgente');
create type public.requisition_status as enum (
  'borrador', 'pendiente_aprobacion', 'aprobada', 'en_proceso', 'cerrada', 'cancelada'
);
create type public.vacancy_status as enum ('borrador', 'abierta', 'pausada', 'cerrada', 'cubierta');
create type public.work_modality as enum ('presencial', 'remoto', 'hibrido');
create type public.employment_type as enum ('tiempo_completo', 'medio_tiempo', 'temporal', 'por_servicios');
create type public.application_stage as enum (
  'nuevo', 'preseleccion', 'entrevista', 'prueba_tecnica', 'oferta', 'contratado', 'descartado', 'retirado'
);
create type public.currency_code as enum ('CRC', 'USD');

-- Provincias de Costa Rica (validación de dominio)
create domain public.cr_province as text
  check (value in ('San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'));

-- Mantiene updated_at actualizado automáticamente
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Asigna created_by con el usuario autenticado si no se especificó
create or replace function private.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
