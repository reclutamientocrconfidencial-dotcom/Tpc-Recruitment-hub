# Manual de operación (fase 2A)

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

### Reversión de la migración 0810 (solo si es imprescindible)

> ⚠️ Elimina los catálogos (etapas, puestos, requisitos, niveles) y la personalización por puesto/vacante.
> Los procesos conservan sus etapas por nombre y categoría (formato 0800). Ensayar primero en TEST.

```sql
drop function if exists public.resolve_pipeline_template(uuid, uuid, uuid);
drop function if exists public.copy_requirement_templates(uuid, uuid, uuid, uuid);
drop function if exists public.duplicate_pipeline_template(uuid, uuid, uuid, uuid, text);
drop trigger if exists requirement_templates_sync_catalog on public.requirement_templates;
drop trigger if exists pipeline_stages_sync_catalog on public.pipeline_stages;
drop function if exists private.sync_requirement_from_catalog();
drop function if exists private.sync_stage_from_catalog();
delete from public.pipeline_templates where position_id is not null or vacancy_id is not null;
drop index if exists public.pipeline_templates_one_default_scope_idx;
create unique index if not exists pipeline_templates_one_default_idx
  on public.pipeline_templates (coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_default;
alter table public.requirement_templates
  drop column if exists catalog_requirement_id, drop column if exists position_id,
  drop column if exists min_level_id, drop column if exists vacancy_id;
alter table public.pipeline_templates
  drop column if exists position_id, drop column if exists vacancy_id, drop column if exists source_template_id;
alter table public.pipeline_stages drop column if exists catalog_stage_id;
drop table if exists public.requirement_catalog;
drop table if exists public.proficiency_levels;
drop table if exists public.proficiency_scales;
drop table if exists public.job_positions;
drop table if exists public.stage_catalog;
```

Luego, para que el guardado de etapas vuelva al comportamiento de 0800, vuelva a ejecutar la sección 8 de la
migración 0800 (función `save_pipeline_stages`).

### Reversión de la migración 0820 (solo si es imprescindible)

> ⚠️ Elimina el flujo de aprobación aplicado en la base de datos, las plazas cubiertas, la prioridad y el horario de
> las vacantes, y el puesto/horario/ubicación de las requisiciones. Las requisiciones y vacantes se conservan.
> Ensayar primero en TEST. La aplicación de la fase 2B dejará de funcionar: revertir antes la versión en Cloudflare.

```sql
drop function if exists public.duplicate_vacancy(uuid, uuid);
drop function if exists public.load_vacancy_requirements(uuid);
drop trigger if exists vacancies_mark_requisition_in_progress on public.vacancies;
drop trigger if exists vacancies_rules on public.vacancies;
drop trigger if exists requisitions_status_rules on public.requisitions;
drop function if exists private.requisition_in_progress_on_vacancy();
drop function if exists private.vacancy_rules();
drop function if exists private.requisition_status_rules();
drop function if exists private.requisition_transition_allowed(public.requisition_status, public.requisition_status);
drop index if exists public.vacancies_title_trgm_idx;
drop index if exists public.vacancies_closes_at_idx;
drop index if exists public.vacancies_position_idx;
drop index if exists public.requisitions_title_trgm_idx;
drop index if exists public.requisitions_target_date_idx;
drop index if exists public.requisitions_position_idx;
alter table public.vacancies
  drop constraint if exists vacancies_filled_range,
  drop column if exists source_vacancy_id, drop column if exists filled_count, drop column if exists priority,
  drop column if exists work_schedule, drop column if exists position_id;
alter table public.requisitions
  drop column if exists modality, drop column if exists province,
  drop column if exists work_schedule, drop column if exists position_id;
```

Los procesos y requisitos propios de vacantes (columna `vacancy_id`, de la 0810) no se eliminan.

## 6. Protocolo de respuesta ante incidentes (borrador — aprobar en la puerta S1)

> Referencia normativa: Ley N.° 8968 y su reglamento (obligaciones de notificación de vulneraciones a la PRODHAB y a
> las personas afectadas en los plazos que establece el reglamento). **Sujeto a revisión jurídica.**

1. **Detectar y registrar** (hora, quién detecta, qué se observó). No borrar evidencia.
2. **Contener:** desactivar usuarios comprometidos (*Administración → Usuarios*), rotar claves en Supabase y
   Cloudflare, revocar sesiones (Supabase → *Authentication*), y si es necesario poner la aplicación fuera de línea
   (Cloudflare → desactivar rutas o *Rollback*).
3. **Evaluar** alcance: qué datos, cuántas personas, desde cuándo (bitácora `audit_logs`, registros de Cloudflare
   y Supabase).
4. **Notificar** al responsable de protección de datos y a la gerencia; con asesoría legal, a la PRODHAB y a las
   personas afectadas según los plazos legales.
5. **Erradicar y recuperar:** corregir la causa; restaurar desde respaldo verificado si hubo alteración.
6. **Lecciones aprendidas:** informe, acciones correctivas y prueba de que no se repite.

| Síntoma | Primer paso |
|---|---|
| Nadie puede iniciar sesión | Revisar `/api/salud`; si `supabase: error`, revisar si el proyecto está pausado |
| Error tras publicar | *Rollback* en Cloudflare (§4) |
| Usuario no ve datos | Verificar rol y estado en *Administración → Usuarios* |
| Sospecha de acceso indebido | Desactivar el usuario, revisar la bitácora (`audit_logs`, solo admin) y avisar al responsable |

### Severidad y decisión de despliegue
| Severidad | Ejemplo | Acción |
|---|---|---|
| Crítica | Acceso a datos personales sin autorización | Detener despliegues; contener de inmediato |
| Alta | Escalamiento de privilegios posible, fuga en errores | Detener despliegues hasta corregir |
| Media | Validación faltante sin exposición de datos | Corregir en la siguiente entrega |
| Baja | Mejora de endurecimiento | Planificar |

## 7. Pendiente (fase 8)
Respaldos cifrados programados, verificación automática de disponibilidad, pruebas de restauración periódicas y
objetivos RPO/RTO definidos por la empresa.
