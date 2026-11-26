# Seguridad, privacidad y permisos

## Política: Security & Privacy by Design (permanente)

Esta política aplica a **todas** las fases y está resumida para el desarrollo en [`CLAUDE.md`](../CLAUDE.md).
Cumplimiento de la Ley N.° 8968 y su reglamento **sujeto a revisión jurídica**.

| # | Requisito | Estado | Dónde / cuándo |
|---|---|---|---|
| 1 | Principio de mínimo privilegio | ✅ Aplicado | 4 roles; `consulta` solo lectura; rol nuevo = `consulta` |
| 2 | RLS y validación de permisos | ✅ Aplicado | RLS forzado en todas las tablas (verificado por prueba automática); `authorizeAction`; 335 pruebas RLS |
| 3 | Autenticación multifactor para usuarios internos | ✅ Implementado (0900) | TOTP de Supabase; al exigirla, la autorización central de la BD requiere `aal2`; activación por un admin verificado |
| 4 | Protección de credenciales y sesiones | ✅ Aplicado | Sin `service_role` en la app; `getUser()`; cookies `httpOnly`; bloqueo de claves secretas públicas; cierre por 30 min de inactividad |
| 5 | Auditoría de modificaciones | ✅ Aplicado | `audit_logs` (sin valores personales) |
| 5b | Auditoría de consultas sensibles, descargas y exportaciones | ✅ Infraestructura (0900) · uso en 2C | `access_logs` inalterable vía `log_access()`; bitácora en *Administración → Bitácora* |
| 6 | Restricción de exportaciones masivas | ✅ Por diseño | No existen exportaciones; fase 7: por rol, con límite, motivo y registro |
| 7 | Almacenamiento privado de documentos | ⏳ Fase 3 | Bucket privado, RLS, enlaces firmados de corta duración |
| 8 | Consentimiento informado y registro de autorizaciones | ✅ Implementado (1000) · ⏳ texto jurídico | Textos versionados e inmutables una vez usados; restricción en la BD: ningún candidato sin consentimiento vigente; revocación → «no contactar» |
| 9 | Protección de formularios públicos y adjuntos | ⏳ Fase 3 | Anti-bots, límites de frecuencia, validación de tipo/tamaño, sin listados públicos |
| 10 | Prevención de filtraciones internas y externas | ✅ Aplicado | CSP, cabeceras, errores sin detalles, `candidate_private` sin acceso directo (solo funciones que registran la lectura), registro de accesos, protección «sin datos reales» |
| 11 | Protección de datos personales en IA | ⏳ Fase 5 | Minimización, seudonimización, revisión humana, sin datos reales en desarrollo |
| 12 | Copias de seguridad cifradas y recuperación verificada | ✅ Implementado · ⏳ configurar secretos | Respaldo diario cifrado con GPG (GitHub Actions); restauración verificada automáticamente en CI ([OPERACION §8](OPERACION.md)) |
| 13 | Protocolo de respuesta ante incidentes | ✅ Borrador | [`OPERACION.md` §6](OPERACION.md) — aprobación de la empresa en S1 |
| 14 | Revisión de dependencias y pruebas automatizadas de seguridad | ✅ Aplicado | CI: `npm audit`, lint de Supabase, RLS, E2E por rol y por API |
| 15 | Cumplimiento Ley 8968 | ⏳ Revisión jurídica | Antes de importar datos reales |

**Regla de despliegue:** se suspende cualquier publicación si existen riesgos críticos o altos sin resolver.

## Roles

| Rol | Descripción |
| --- | --- |
| `admin` | Acceso total. Único que elimina registros, cambia roles y ve la bitácora. |
| `coordinador` | Gestiona clientes, requisiciones, vacantes, candidatos y postulaciones. |
| `reclutador` | Trabaja solo lo asignado: requisiciones/vacantes asignadas y sus postulaciones; crea candidatos propios. |
| `consulta` | Solo lectura. Rol por defecto de todo usuario nuevo (mínimo privilegio). |

Un usuario con `is_active = false` no ve ningún dato (solo su propio perfil). Los anónimos no tienen acceso a ninguna tabla.

## Matriz RLS

| Tabla | Leer | Crear | Editar | Eliminar |
| --- | --- | --- | --- | --- |
| profiles | usuarios activos (y el propio) | — (solo trigger de Auth) | propio (sin rol/estado) · admin | — |
| clients | activos | admin, coordinador | admin, coordinador | admin |
| requisitions | admin, coordinador, consulta · reclutador asignado | admin, coordinador (solo en borrador o pendiente) | admin, coordinador; **aprobar**: solo admin/coordinador, registrado por la BD; transiciones validadas | admin |
| vacancies | admin, coordinador, consulta · reclutador: asignadas o abiertas | admin, coordinador (solo de requisiciones aprobadas o en proceso) | admin, coordinador · reclutador asignado: **solo estado y plazas cubiertas** (fase 2B) | admin |
| candidates | activos (ficha general, **sin** datos de contacto) | solo `save_candidate()` / importación (exige consentimiento) | admin, coordinador · reclutador responsable | admin |
| candidate_private | **nadie directamente**: `get_candidate_private()` (admin, coord, reclutador de sus candidatos/vacantes; registra cada lectura) | solo funciones | solo funciones | — |
| consent_texts | activos | admin | admin (texto inmutable una vez otorgado) | — |
| candidate_consents | admin, coordinador, reclutador | solo funciones | solo revocación por función | — |
| candidate_profiles, cr_cantons | activos | solo funciones / migración | — | — |
| import_batches, import_rows | admin, coordinador | solo funciones | solo funciones (datos de filas se borran al importar o cancelar) | — |
| applications | admin, coordinador, consulta · reclutador asignado | `create_application()`: admin, coordinador · reclutador de la vacante (candidato activo con consentimiento; vacante abierta/pausada) | `move_application()` y seguimiento: admin, coordinador · reclutador responsable o asignado; motivo de descarte obligatorio; contratar exige plazas | admin |
| vacancy_stages | activos | solo funciones | solo funciones | — |
| application_events | admin, coordinador, reclutador (de postulaciones visibles) · **no consulta** | solo triggers/funciones | — | — |
| application_notes | «equipo»: personal operativo con acceso · «confidencial»: autor, coordinación y admin · **no consulta** | personal operativo (autor no suplantable) | — | — |
| application_requirement_checks | admin, coordinador, reclutador · **no consulta** | solo `set_requirement_check()` | solo función | — |
| audit_logs | admin | — (solo triggers) | — | — |
| intake_channels (fuentes) | activos | admin | admin | — (se desactivan) |
| pipeline_templates / pipeline_stages | activos | admin, coordinador | admin, coordinador | admin, coordinador (nunca la predeterminada) |
| requirement_templates | activos | admin, coordinador | admin, coordinador | admin, coordinador |
| stage_catalog, job_positions, requirement_catalog, proficiency_scales, proficiency_levels | activos | admin, coordinador | admin, coordinador | — (se desactivan) |
| requirement_catalog_history | admin, coordinador | — (solo trigger) | — | — |
| security_settings | con sesión | — | admin **con aal2** | — |
| access_logs | admin | — (solo `log_access()`) | — | — |
| public_forms, form_questions, form_links | admin, coordinador, reclutador · **no consulta** | admin, coordinador | admin, coordinador | — (se desactivan) |
| intake_submissions, submission_answers | admin, coordinador · reclutador de la vacante · **no consulta** | solo `submit_public_form()` (anon **con clave de servidor**) | solo `review_submission()` | — |
| candidate_documents | igual que los datos sensibles del candidato | solo funciones (formulario o `register_candidate_document()`) | — | — |
| interview_questions, assessment_types, credential_types | admin, coordinador, reclutador · **no consulta** | admin, coordinador | admin, coordinador | — (se desactivan) |
| vacancy_assessments | activos | admin, coordinador | admin, coordinador | admin, coordinador |
| interviews, interview_answers, assessment_results, executive_reports | admin, coordinador · reclutador responsable o asignado · **no consulta** | mismos | mismos (informe final inmutable; reabrir: admin/coord → versión nueva) | — |
| candidate_credentials | personal operativo que ve los datos sensibles del candidato · **no consulta** | mismo | mismo (verificación registrada por la BD) | — |
| report_templates | operativo | admin | admin (versión nueva; la anterior queda en historial) | — |
| storage `curriculums` | quien ve los datos sensibles del candidato / del envío (enlace firmado de 60 s, descarga registrada) | anon: solo su envío con token de un solo uso (30 min) · personal: candidatos que puede editar | — | envíos descartados · cargas no registradas |

## Medidas implementadas

- RLS **habilitado y forzado** en todas las tablas; privilegios del rol `anon` revocados.
- `TRUNCATE` revocado (ignoraría RLS).
- Funciones de autorización `SECURITY DEFINER` en el esquema `private` (no expuesto por la API), con `search_path` vacío.
- Trigger que impide el escalamiento de privilegios (solo un admin cambia rol/estado; un admin no puede degradarse a sí mismo).
- Bitácora de auditoría inmutable con actor, acción y **nombres** de campos modificados (sin valores personales).
- Sesión validada con `supabase.auth.getUser()` en el middleware (no se confía solo en la cookie).
- Mensaje de error de login genérico (evita enumeración de usuarios); validación con Zod.
- Protección contra redirecciones abiertas en `?next=`.
- Cabeceras HTTP: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS; sin `X-Powered-By`.
- `created_by` se fuerza al usuario autenticado y es inmutable (no se puede atribuir un registro a otra persona).
- Funciones de trigger no invocables directamente; vista de métricas de solo lectura.
- Content-Security-Policy (`frame-ancestors 'none'`, `object-src 'none'`, conexiones solo a la app y a Supabase).
- La app se niega a iniciar si se coloca una clave secreta (`sb_secret_…` o `service_role`) en una variable pública.
- Registro público deshabilitado (`supabase/config.toml` en local; debe desactivarse también en el panel del proyecto).
- Sin credenciales en el repositorio (`.env*` y `.dev.vars` ignorados).
- **Fase 2B (migración 0820):** flujo de estados de requisiciones validado por trigger (no se puede crear una
  requisición ya aprobada ni saltar etapas); la aprobación registra `approved_by`/`approved_at` y no se puede alterar
  manualmente; vacantes solo desde requisiciones aprobadas o en proceso; el reclutador asignado solo cambia estado y
  plazas cubiertas (salario, plazas, puesto y demás datos: solo admin/coordinador); una vacante no cambia de
  requisición ni vuelve a borrador. Duplicar vacantes y cargar requisitos: `SECURITY INVOKER`, solo admin/coordinador;
  la duplicación nunca copia postulaciones. Todos los cambios quedan en la bitácora (`audit_logs`).
- **Plazas autorizadas (migración 0840):** ninguna vacante se publica, reabre ni amplía si las plazas comprometidas de
  su requisición (vacantes publicadas + cubiertas de las cerradas) superarían las autorizadas; las autorizadas no
  bajan de las comprometidas. Las vacantes en borrador no comprometen plazas ni cuentan en el avance.
- **Base madre de candidatos (migración 1000):** datos sensibles (cédula, correo, teléfono, pretensión salarial, notas)
  en `candidate_private`, sin acceso directo; el rol consulta nunca los ve; cada lectura y búsqueda por dato de contacto
  queda en `access_logs`. Columnas antiguas de `candidates` siempre vacías (un trigger traslada cualquier valor).
  Consentimiento versionado obligatorio (restricción diferida). Duplicados: cédula normalizada única (bloqueo);
  teléfono E.164, correo y nombre → revisión humana. Importación por lotes con decisión humana, registro y reversión
  (solo admin). **Protección «sin datos reales»:** mientras un admin no la habilite (requiere MFA exigida), solo se
  aceptan correos `*.test`/`*.example`; con datos reales, el consentimiento vigente debe tener aprobación jurídica.
- **Postulaciones (migración 1100):** reglas en la BD (candidato activo con consentimiento vigente, vacante abierta o
  pausada, etapa de la propia vacante, motivo de descarte obligatorio, contratación solo con plazas disponibles; las
  plazas cubiertas se actualizan solas). Historial inalterable. Observaciones con nivel de confidencialidad. El rol
  consulta ve el tablero, pero no observaciones, historial ni evaluaciones.
- **Recepción y formularios públicos (migración 1200):** el público no tiene acceso a ninguna tabla; solo a funciones
  acotadas. Los envíos exigen una **clave de servidor** (guardada como huella SHA-256 en un esquema privado), por lo
  que nadie puede saltarse la aplicación llamando a la API. Anti-robots: campo trampa y tiempo mínimo; límites de
  frecuencia por conexión (huella con sal secreta, nunca la IP), por enlace y por persona. Consentimiento digital
  obligatorio con evidencia (formulario, enlace, versión, fecha y envío). Sin coincidencias → incorporación
  automática; con posible duplicado → revisión humana; al resolver, los datos personales del envío se eliminan
  (minimización). La respuesta esperada de las preguntas eliminatorias nunca se expone. Currículums en un bucket
  privado: tipo real verificado por contenido (PDF/DOCX), 5 MB, rutas aleatorias, enlaces firmados de 60 s y cada
  descarga en `access_logs`. **Puerta S1:** sin datos reales habilitados, solo correos ficticios; con datos reales,
  consentimiento con aprobación jurídica.
- **Entrevistas, evaluaciones e informes (migración 1300):** reglas en la BD (puntaje dentro del máximo, nivel de
  la escala del tipo, entrevista «realizada» con recomendación, credencial con vencimiento obligatorio según su tipo,
  respaldo del mismo candidato). La verificación de credenciales, el evaluador y quien finaliza el informe se
  registran con el usuario real (no se suplantan). El informe final no se modifica; reabrirlo crea una versión nueva.
  **Exportación registrada:** solo del informe final, por quien ve la postulación, con entrada en `access_logs`
  («exportar») antes de generar el archivo; Word y PDF se generan en el servidor sin servicios externos, con
  `Cache-Control: no-store`. El informe excluye cédula y datos de contacto (minimización).
- **Catálogo de requisitos (migración 0830):** edición de nombre, categoría, escala y descripción solo por
  admin/coordinador; historial inalterable con valores anteriores y nuevos, autor y fecha (el catálogo no contiene
  datos personales); el nombre y la categoría se propagan a los requisitos configurados; la escala no cambia si hay
  niveles mínimos configurados con la escala anterior.

## Ley N.° 8968 (Protección de datos personales)

- Campos `consent_given` / `consent_at` en candidatos (restricción: consentimiento implica fecha).
- La bitácora no duplica datos personales.
- Borrado de un candidato elimina en cascada sus postulaciones (derecho de supresión; solo admin).
- Las pruebas usan exclusivamente datos ficticios (dominio reservado `.test`).
- Pendiente (fase 2+): texto de consentimiento, política de retención y exportación de datos del titular.

### Decisiones a validar con la empresa
- **Banco de talento compartido:** todos los usuarios activos (incluido `consulta`) leen los datos de los candidatos,
  incluidos cédula, teléfono y pretensión salarial. Si se prefiere minimizar, en la fase 2 puede limitarse
  `consulta` a una vista sin esos campos.
- **Directorio interno:** los usuarios activos ven nombre, correo y rol de sus compañeros (necesario para asignar trabajo).

## Verificación

- `npm run test:db`: 114 aserciones RLS en un PostgreSQL local (ver `supabase/rls-tests/rls_test.sql`).
- En la CI, las mismas 114 aserciones corren sobre el Postgres oficial de Supabase, junto con `supabase db lint`.
- `npm run test:e2e:supabase`: 22 pruebas E2E con Supabase Auth real (cada rol, API REST anónima, registro
  deshabilitado e intento de escalamiento de privilegios vía API).
