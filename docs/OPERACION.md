# Manual de operación

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

### Reversión de la migración 0830 (solo si es imprescindible)

> ⚠️ Elimina el historial de cambios del catálogo de requisitos y la propagación automática de nombres.
> El catálogo y los requisitos configurados se conservan. Ensayar primero en TEST.

```sql
drop trigger if exists requirement_catalog_after_update on public.requirement_catalog;
drop trigger if exists requirement_catalog_guard_scale on public.requirement_catalog;
drop function if exists private.requirement_catalog_after_update();
drop function if exists private.requirement_catalog_guard_scale();
drop table if exists public.requirement_catalog_history;
```

### Reversión de la migración 0840 (solo si es imprescindible)

> ⚠️ Quita la validación de plazas autorizadas. Ensayar primero en TEST.

```sql
drop trigger if exists requisitions_positions_guard on public.requisitions;
drop function if exists private.requisition_positions_guard();
```

Luego vuelva a ejecutar, de la migración 0820, solo el bloque `create or replace function private.vacancy_rules()`
(sección 3) y, después, ejecute:

```sql
drop function if exists private.requisition_committed_openings(uuid, uuid);
drop function if exists private.vacancy_committed_openings(public.vacancy_status, integer, integer);
```

### Reversión de la migración 0900 — Puerta S1 (solo si es imprescindible)

> ⚠️ Quita la exigencia de verificación en dos pasos en la base de datos y el registro de accesos (se pierde ese
> registro). Ensayar primero en TEST. Antes, desactive la exigencia desde *Administración → Seguridad*.

```sql
create or replace function private.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;
drop function if exists public.users_mfa_status();
drop function if exists public.log_access(text, text, uuid, text, integer);
drop table if exists public.access_logs;
drop table if exists public.security_settings;
drop function if exists private.security_settings_stamp();
drop function if exists private.mfa_satisfied();
```

### Reversión de la migración 1000 — Fase 2C (solo si es imprescindible)

> ⚠️ Devuelve los datos de contacto a la tabla `candidates` (visibles para todo usuario activo, incluido el rol
> consulta) y elimina consentimientos, perfiles, lotes de importación y el registro de duplicados.
> **Con datos reales, no la ejecute sin autorización de la gerencia y del asesor legal.** Ensayar primero en TEST.

```sql
-- 1) Datos sensibles de vuelta a candidates (sin perderlos)
drop trigger if exists candidates_protect on public.candidates;
drop trigger if exists candidates_after_insert on public.candidates;
drop trigger if exists candidates_require_consent on public.candidates;
update public.candidates c set national_id = p.national_id, email = p.email, phone = p.phone,
       expected_salary = p.expected_salary, notes = p.confidential_notes
from public.candidate_private p where p.candidate_id = c.id;
-- 2) Objetos de la fase 2C
drop function if exists public.import_batch_revert(uuid, text), public.import_batch_cancel(uuid),
  public.import_batch_commit(uuid), public.import_set_decision(uuid, integer, text), public.import_batch_finish(uuid),
  public.import_batch_add_rows(uuid, jsonb), public.import_batch_create(text, uuid, text, text, text),
  public.add_candidate_consent(uuid, text, text), public.revoke_candidate_consent(uuid, text),
  public.save_candidate(uuid, jsonb), public.merge_candidates(uuid, uuid), public.dismiss_duplicate_pair(uuid, uuid),
  public.list_possible_duplicates(integer), public.find_candidate_duplicates(text, text, text, text, text, uuid),
  public.search_candidates_by_contact(text), public.get_candidate_private(uuid, text);
alter table public.candidates drop constraint if exists candidates_import_batch_fk;
drop table if exists public.import_rows, public.import_batches, public.candidate_duplicate_dismissals,
  public.candidate_profiles, public.candidate_private, public.candidate_consents, public.consent_texts, public.cr_cantons;
alter table public.candidates drop column if exists district, drop column if exists locality,
  drop column if exists intake_channel_id, drop column if exists source_detail, drop column if exists status,
  drop column if exists merged_into_id, drop column if exists full_name_norm, drop column if exists import_batch_id,
  drop column if exists updated_by;
drop trigger if exists security_settings_rules on public.security_settings;
alter table public.security_settings drop column if exists real_data_enabled;
drop function if exists private.candidate_consents_sync(), private.candidates_require_consent(), private.candidates_after_insert(),
  private.candidates_protect(), private.candidate_private_normalize(), private.write_audit_log_candidate(),
  private.consent_texts_rules(), private.security_settings_rules(), private.real_data_enabled(),
  private.can_view_candidate_private(uuid), private.can_edit_candidate(uuid),
  private.norm_name(text, text), private.norm_email(text), private.norm_phone(text), private.norm_digits(text);
```

Las funciones `private.write_audit_log()` y `private.keep_created_by()` actualizadas por la 1000 son compatibles y
pueden quedarse.

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

## 7. Verificación en dos pasos (puerta S1)

1. **Supabase (cada proyecto):** *Authentication → Multi-Factor* → confirme que **TOTP (App Authenticator)** está
   habilitado (lo está por omisión en los proyectos de Supabase).
2. Cada usuario interno: icono del escudo (arriba a la derecha) → **Mi seguridad** → *Comenzar* → escanear el QR →
   escribir el código → *Activar*.
3. Un administrador con su verificación activa: *Administración → Seguridad* → revisar que todos los usuarios activos
   aparezcan como **Configurada** → **Exigir a todos los usuarios**.
4. Desde ese momento la base de datos solo entrega información a sesiones verificadas con código (`aal2`).
5. **Celular perdido:** un administrador elimina el factor del usuario en Supabase (*Authentication → Users → usuario
   → MFA factors → eliminar*) y el usuario vuelve a configurarlo. Registre el incidente.
6. Las sesiones se cierran tras **30 minutos de inactividad**.

## 8. Respaldos cifrados y recuperación (puerta S1 / fase 8)

**Qué se respalda:** esquemas `public`, `private` y `auth` (datos, estructura, RLS y permisos), con `pg_dump`.
**Cifrado:** GPG con la **clave pública** de la empresa; la **clave privada** se guarda fuera de GitHub (por ejemplo,
en una memoria USB cifrada en caja fuerte y una copia en otra ubicación), con dos custodios.
**Frecuencia y retención:** diario (01:17 hora de Costa Rica) · 14 días como artefacto privado de GitHub Actions.

### 8.1 Configuración (una sola vez, con autorización)
1. **Clave GPG de la empresa** (en un equipo de confianza, no en el servidor):
   `gpg --quick-gen-key "TPC Respaldos <respaldos@empresa>" default default 2y` →
   exportar la pública: `gpg --armor --export respaldos@empresa > publica.asc` →
   exportar y custodiar la privada: `gpg --armor --export-secret-keys respaldos@empresa > privada.asc`.
2. **Credencial de respaldo** en Supabase (SQL Editor del proyecto que se respalda):
   `create role respaldo_lectura login password '<contraseña larga generada>' bypassrls;`
   `grant pg_read_all_data to respaldo_lectura;`
   (Solo lectura. Si la plataforma no permite `bypassrls`, use temporalmente el usuario `postgres` y documéntelo.)
3. **Cadena de conexión:** *Project Settings → Database → Connection string → Session pooler* (IPv4), reemplazando
   usuario y contraseña por los de `respaldo_lectura`.
4. **GitHub:** *Settings → Secrets and variables → Actions → New repository secret*:
   `RESPALDO_DB_URL` (la cadena) y `RESPALDO_GPG_PUBLIC_KEY` (contenido de `publica.asc`).
5. *Actions → Respaldo cifrado → Run workflow* y confirme que termina en verde con un artefacto `respaldo-…`.

### 8.2 Prueba de recuperación
- **Automática (CI, en cada cambio):** `scripts/prueba-respaldo.sh` genera un respaldo cifrado del Supabase local,
  lo restaura en una base vacía y compara los registros de todas las tablas y las políticas RLS.
- **Manual (trimestral, con un respaldo real de TEST):** descargar el artefacto, y en un equipo con Docker:
  `npx supabase start` (base local) → crear una base vacía → `RESPALDO_ARCHIVO=… RESPALDO_GPG_PRIVATE_KEY=privada.asc
  DESTINO_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/restauracion scripts/restaurar-respaldo.sh` →
  comprobar conteos. El script **se niega a restaurar sobre servidores remotos**.
- **Recuperación real** (incidente): crear un proyecto Supabase nuevo, aplicar las migraciones del repositorio y
  restaurar los datos del respaldo; requiere autorización de la gerencia y se registra en el informe del incidente.

### 8.3 Objetivos (a definir por la empresa)
| Indicador | Propuesta inicial |
|---|---|
| RPO (pérdida máxima de datos) | 24 horas (respaldo diario) |
| RTO (tiempo máximo de recuperación) | 1 día hábil |

## 9. Pendiente (fase 8)
Verificación automática de disponibilidad con alertas y prevención de la pausa por inactividad de Supabase gratuito.
