# Manual de operación (versión inicial — fase 2A)

> Requisito de continuidad operativa (fase 8) incorporado desde la fase 2.
> Este documento **no** contiene contraseñas ni claves. Las credenciales se custodian fuera del repositorio.

## 1. Ambientes

| Ambiente | Supabase | Cloudflare Worker | Rama | Datos |
|---|---|---|---|---|
| **Producción** | proyecto de producción | `tpc-recruitment-hub` | `main` | Reales (cuando se autorice la importación) |
| **Pruebas** | `tpc-recruitment-hub-test` | `tpc-recruitment-hub-test` (opcional) | rama de la PR | **Solo ficticios** |
| Local / CI | Supabase local (Docker) | `wrangler dev` | cualquiera | Solo ficticios |

Regla de oro: **antes de ejecutar SQL, confirme el nombre del proyecto en la esquina superior izquierda de Supabase.**

## 2. Cuentas y responsables (completar por la empresa)

| Servicio | Responsable principal | Responsable alterno | Verificación en dos pasos |
|---|---|---|---|
| GitHub | | | ☐ |
| Supabase | | | ☐ |
| Cloudflare | | | ☐ |

Se recomienda al menos **dos administradores** por servicio y nunca compartir contraseñas.

## 3. Monitoreo básico

- **Ruta de salud:** `https://<su-worker>.workers.dev/api/salud`
  - `200` + `"estado":"ok"` → aplicación y autenticación de Supabase disponibles.
  - `503` + `"estado":"degradado"` → la aplicación responde pero Supabase no (¿proyecto pausado?).
  - No devuelve datos personales ni internos.
- **Cloudflare:** *Workers & Pages → tpc-recruitment-hub → Metrics* (errores, CPU, solicitudes).
- **Supabase:** *Reports* (uso de base de datos) y *Advisors → Security Advisor*.
- **Pausa por inactividad (Supabase gratuito):** tras 7 días sin uso el proyecto se pausa. Se reactiva desde el
  panel (*Restore project*). La verificación programada llegará en la entrega 2B.

## 4. Volver a la versión anterior de la aplicación (Cloudflare)

1. *Workers & Pages → tpc-recruitment-hub → Deployments*.
2. En la versión anterior estable, menú **⋯ → Rollback** (o *Deploy version*).
3. Confirmar y verificar `/api/salud`.

Esto **no** revierte la base de datos. Las migraciones son aditivas y compatibles con la versión anterior del código,
por lo que normalmente no hace falta revertirlas.

## 5. Aplicar migraciones desde el navegador

1. Aplicar **primero en el proyecto de pruebas** y verificar.
2. En producción: confirmar el nombre del proyecto, abrir una consulta nueva en el *SQL Editor*, pegar el archivo
   desde GitHub (`supabase/migrations/…`), ejecutar **una sola vez**.
3. Ejecutar la consulta de verificación correspondiente (`supabase/verification/…`).
4. Solo entonces fusionar la PR.

### Reversión de la migración 0800 (solo si es imprescindible)

> ⚠️ Elimina la configuración de procesos, requisitos y fuentes creada desde la 2A. Ensayar primero en pruebas.

```sql
drop function if exists public.save_pipeline_stages(uuid, jsonb);
drop table if exists public.pipeline_stages;
drop table if exists public.pipeline_templates;
drop table if exists public.requirement_templates;
drop table if exists public.intake_channels;
drop type if exists public.intake_channel_category;
drop type if exists public.stage_category;
drop type if exists public.stage_type;
drop type if exists public.requirement_type;
drop type if exists public.requirement_category;
drop index if exists public.clients_name_trgm_idx;
drop index if exists public.clients_legal_id_trgm_idx;
```

## 6. Incidentes

| Síntoma | Primer paso |
|---|---|
| Nadie puede iniciar sesión | Revisar `/api/salud`; si `supabase: error`, revisar si el proyecto está pausado |
| Error tras publicar | *Rollback* en Cloudflare (§4) |
| Usuario no ve datos | Verificar rol y estado en *Administración → Usuarios* |
| Sospecha de acceso indebido | Desactivar el usuario, revisar la bitácora (`audit_logs`, solo admin) y avisar al responsable |

## 7. Pendiente (fase 8)
Respaldos cifrados programados, verificación automática de disponibilidad, pruebas de restauración periódicas y
objetivos RPO/RTO definidos por la empresa.
