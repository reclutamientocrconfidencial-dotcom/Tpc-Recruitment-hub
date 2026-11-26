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

### Confirmar la versión publicada
- `GET /api/salud` devuelve el commit corto publicado (variable `WORKERS_CI_COMMIT_SHA` al compilar); también se
  muestra en el menú lateral («Versión …»).
- Tras cambiar la rama del Worker en *Settings → Build → Branch control*, Cloudflare solo compila con el **siguiente
  push** a esa rama. Si no aparece una compilación nueva, use *Deployments → Builds → Retry build* o haga un commit.

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

### Reversión de la migración 1100 — Fase 2D (solo si es imprescindible)

> ⚠️ Elimina el historial de movimientos, las observaciones, la evaluación de requisitos y las etapas fijadas de
> las vacantes. Las postulaciones se conservan con su etapa de la fase 1 (columna `stage`). Ensayar primero en TEST.

```sql
drop trigger if exists applications_rules on public.applications;
drop trigger if exists applications_after on public.applications;
drop function if exists public.sync_vacancy_stages(uuid), public.set_requirement_check(uuid, uuid, text, uuid, text),
  public.update_application_tracking(uuid, smallint, text, date), public.move_application(uuid, uuid, text, text),
  public.create_application(uuid, uuid, text);
drop table if exists public.application_requirement_checks, public.application_notes, public.application_events;
alter table public.applications drop column if exists stage_id, drop column if exists discard_reason,
  drop column if exists discard_note, drop column if exists next_action, drop column if exists next_action_at,
  drop column if exists hired_at, drop column if exists updated_by;
drop table if exists public.vacancy_stages;
drop function if exists private.can_manage_application(uuid), private.application_notes_event(),
  private.applications_after(), private.applications_rules(), private.legacy_stage(public.stage_category, public.stage_type, text),
  private.freeze_vacancy_stages(uuid), private.write_audit_log_by_application();
```

La corrección de `private.requisition_status_rules()` incluida en la 1100 es compatible y puede quedarse.

### Reversión de la migración 1200 — Fase 3: recepción (solo si es imprescindible)

> ⚠️ Elimina formularios, preguntas, enlaces (los QR impresos dejan de funcionar), la bandeja de envíos y el registro
> de currículums. Los candidatos y postulaciones ya incorporados se conservan. Antes, descargue o elimine los archivos
> del bucket `curriculums` desde *Storage* (los objetos no se borran con SQL). Ensayar primero en TEST.

```sql
drop policy if exists "curriculums: carga desde formularios" on storage.objects;
drop policy if exists "curriculums: carga del personal" on storage.objects;
drop policy if exists "curriculums: lectura autorizada" on storage.objects;
drop policy if exists "curriculums: eliminar no registrados" on storage.objects;
drop function if exists public.submit_public_form(text, text, jsonb, text), public.attach_submission_cv(text, uuid, uuid, text, integer),
  public.get_public_form(text), public.review_submission(uuid, text, uuid, text),
  public.register_candidate_document(uuid, text, text, text, integer), public.document_for_download(uuid),
  public.submission_cv_for_download(uuid), public.can_upload_submission_cv(text);
alter table public.applications drop column if exists submission_id, drop column if exists intake_channel_id,
  drop column if exists source_detail;
drop table if exists public.candidate_documents, public.submission_answers, public.intake_submissions,
  public.form_links, public.form_questions, public.public_forms;
drop function if exists private.can_read_cv_object(text), private.can_write_candidate_cv(text), private.can_delete_cv_object(text),
  private.incorporate_submission(uuid, uuid), private.find_matches(text, text, text, text, text),
  private.form_link_available(text), private.can_view_submission(uuid), private.random_code(),
  private.valid_public_form_key(text), private.set_public_form_key(text);
drop table if exists private.public_form_settings;
-- El bucket vacío se elimina desde Storage → curriculums → Delete bucket.
```

### Reversión de la migración 1300 — Fase 4: evaluaciones (solo si es imprescindible)

> ⚠️ Elimina entrevistas, guiones, resultados de evaluaciones, credenciales e informes ejecutivos (también los
> finales). Exporte antes los informes necesarios. Los archivos de respaldo quedan en `candidate_documents`
> (tipo «credencial»). Ensayar primero en TEST.

```sql
drop function if exists public.log_report_export(uuid, text), public.expiring_credentials(integer),
  public.register_candidate_file(uuid, text, text, text, integer, text);
drop table if exists public.executive_reports, public.report_templates, public.candidate_credentials,
  public.interview_answers, public.interviews, public.assessment_results, public.vacancy_assessments,
  public.credential_types, public.assessment_types, public.interview_questions;
drop function if exists private.executive_reports_rules(), private.candidate_credentials_rules(),
  private.interviews_seed_questions(), private.interviews_rules(), private.assessment_results_rules(),
  private.can_view_application_detail(uuid), private.is_operational();
-- Opcional: restaurar la versión 1200 de private.can_write_candidate_cv (solo PDF/DOCX) desde la migración 1200.
```

### Reversión de la migración 1400 — Fase 5: IA (solo si es imprescindible)

> Elimina la configuración y el registro de uso de IA (incluidos costos). Exporte antes el consumo si se requiere
> para facturación. Ensayar primero en TEST.

```sql
drop function if exists public.ai_usage_summary(), public.ai_review_request(uuid, text, text),
  public.ai_finish_request(uuid, jsonb, integer, integer, numeric, text),
  public.ai_begin_request(text, uuid, uuid, uuid, text, boolean);
drop table if exists public.ai_requests, public.ai_settings;
drop function if exists private.ai_month_cost(), private.can_view_ai_request(uuid), private.ai_settings_rules(),
  private.write_audit_log_settings();
```

### Reversión de la migración 1500 — Fase 6: Mi jornada (solo si es imprescindible)

> Elimina tareas y recordatorios y los enlaces de calendario (las suscripciones dejan de actualizarse).

```sql
drop function if exists public.productivity_indicators(date, date), public.calendar_feed(text),
  public.calendar_status(), public.revoke_calendar_token(), public.rotate_calendar_token();
drop table if exists private.calendar_tokens, public.tasks;
drop function if exists private.tasks_rules();
```

### Reversión de la migración 1600 — Fase 7: indicadores (solo si es imprescindible)

> Solo elimina funciones de lectura; no borra datos. El registro de exportaciones permanece en `access_logs`.

```sql
drop function if exists public.export_dataset(text, text, date, date, uuid), public.analytics_clients(date, date),
  public.analytics_recruiters(date, date, uuid), public.analytics_sources(date, date, uuid),
  public.analytics_stage_times(date, date, uuid), public.analytics_funnel(date, date, uuid),
  public.analytics_summary(date, date, uuid);
drop function if exists private.analytics_period(date, date), private.analytics_applications(uuid), private.analytics_full_scope();
```

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

## 9. Formularios públicos y currículums (fase 3)

### 9.1 Clave de servidor de los formularios (una vez por ambiente)
La base de datos solo acepta envíos públicos que traen la **clave de servidor**; así nadie puede enviar postulaciones
llamando directamente a la API de Supabase y saltarse los controles anti-robots de la aplicación.
1. Genere una clave larga aleatoria **en su equipo** (no la pegue en chats ni correos): por ejemplo, en una terminal
   `openssl rand -hex 32`, o un generador de contraseñas de 64 caracteres.
2. **Supabase TEST → SQL Editor** (confirme el nombre del proyecto arriba a la izquierda):
   `select private.set_public_form_key('<la clave>');` → *Run*. La base guarda solo su huella SHA-256.
3. **Cloudflare → Workers & Pages → `tpc-recruitment-hub-test` → Settings → Variables and Secrets → Add →
   Type: Secret**, nombre `PUBLIC_FORM_KEY`, valor: la misma clave → *Deploy*.
4. Verificación: `supabase/verification/1200_verificar.sql` debe mostrar «clave de formularios configurada: ok».
5. **Rotación** (si la clave se expone o cada 12 meses): repita los pasos 1 a 3 con una clave nueva. Entre el paso 2 y
   el 3 los formularios rechazan envíos durante unos minutos.
6. Producción usa **otra clave distinta**, configurada solo cuando se autorice el pase a producción.

### 9.2 Almacenamiento de currículums
- Bucket **privado** `curriculums` (lo crea la migración 1200): 5 MB, solo PDF y Word (.docx). La aplicación valida
  además el contenido real del archivo (no solo la extensión).
- Rutas: `envios/<envío>/<token>.pdf` (formularios) y `candidatos/<candidato>/<archivo>` (cargas del personal).
- Las descargas usan **enlaces firmados de 60 segundos** y quedan en *Administración → Registro de accesos*
  (acción «descargar»).
- Al **descartar** un envío se eliminan sus datos personales y su currículum.

### 9.3 Límites anti-abuso
- 20 envíos por hora por conexión (se guarda solo una huella con sal secreta, nunca la IP).
- 500 envíos por día por enlace; un envío repetido (mismo correo o teléfono) en revisión se rechaza durante 24 horas.
- Campo trampa y tiempo mínimo de llenado (3 s) contra robots. **Recomendado antes de datos reales:** activar
  Cloudflare Turnstile (gratuito) — pendiente de autorización.

### 9.4 Puerta S1 en formularios públicos
Mientras `real_data_enabled` esté desactivado, la base de datos **solo acepta envíos con correo ficticio**
(`*.test` / `*.example`). Al habilitar datos reales, además exige que el consentimiento vigente tenga aprobación
jurídica. No publique enlaces ni QR fuera del equipo hasta completar S1.

## 10. Inteligencia artificial (fase 5)
- **Por omisión la IA está apagada.** Administración puede activar el proveedor **simulado** (no envía datos a
  terceros) para probar los flujos en TEST.
- **Activar un proveedor externo (Anthropic) requiere autorización expresa** de costos y del acuerdo de tratamiento
  de datos. Pasos, solo cuando estén autorizados:
  1. Contratar la API con el proveedor (cuenta de la empresa) y firmar el acuerdo de tratamiento de datos (DPA).
  2. **Cloudflare → Worker → Settings → Variables and Secrets → Add → Secret** `ANTHROPIC_API_KEY` (nunca en el
     repositorio ni en el chat).
  3. Iniciar sesión como administración **con verificación en dos pasos** → *Administración → Inteligencia
     artificial* → proveedor «Anthropic», modelo, **presupuesto mensual** y límite diario por usuario → marcar la
     confirmación del acuerdo con su referencia → *Guardar*.
- Controles automáticos: límite diario por usuario, bloqueo al agotar el presupuesto del mes, registro de cada uso
  (función, usuario, modelo, tokens, costo), seudonimización previa y **revisión humana obligatoria**.
- Para apagar la IA de inmediato: desmarcar *Asistente de IA activado* (o eliminar el secreto del Worker).

## 11. Calendario (fase 6)
- Cada persona genera en *Mi jornada* un **enlace secreto** de suscripción (iCalendar) con sus entrevistas
  programadas y tareas pendientes (últimos 30 días y futuras). El calendario **no incluye nombres de candidatos ni
  datos de contacto**: solo el código de la vacante, la modalidad y el lugar o enlace.
- La ruta `/api/calendario/<enlace>` es pública porque las aplicaciones de calendario no inician sesión; la protege
  el enlace de 64 caracteres (solo se guarda su huella). Si se expone, *Renovar enlace* o *Revocar enlace*.
- Al desactivar a un usuario o cambiarlo a «consulta», su enlace deja de entregar eventos.

## 12. Exportaciones (fase 7)
- Solo **administración y coordinación** exportan; la base de candidatos, solo administración.
- Cada exportación exige **motivo**, tiene un límite de **5.000 filas** y **20 por usuario por día**, y se registra en
  *Administración → Bitácora* (registro de accesos, acción «exportar», con motivo y cantidad) **antes** de entregar el
  archivo.
- Las exportaciones **nunca** incluyen cédula, correo, teléfono, pretensión salarial ni notas. Los textos que empiezan
  con `=`, `+`, `-` o `@` se neutralizan para evitar fórmulas maliciosas en Excel.
- Revisión sugerida: mensualmente, revisar las exportaciones registradas y sus motivos.

## 13. Pendiente (fase 8)
Verificación automática de disponibilidad con alertas y prevención de la pausa por inactividad de Supabase gratuito.
