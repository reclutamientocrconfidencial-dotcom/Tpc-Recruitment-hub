# Seguridad, privacidad y permisos

## Política: Security & Privacy by Design (permanente)

Esta política aplica a **todas** las fases y está resumida para el desarrollo en [`CLAUDE.md`](../CLAUDE.md).
Cumplimiento de la Ley N.° 8968 y su reglamento **sujeto a revisión jurídica**.

| # | Requisito | Estado | Dónde / cuándo |
|---|---|---|---|
| 1 | Principio de mínimo privilegio | ✅ Aplicado | 4 roles; `consulta` solo lectura; rol nuevo = `consulta` |
| 2 | RLS y validación de permisos | ✅ Aplicado | RLS forzado en todas las tablas; `authorizeAction`; 174 pruebas RLS |
| 3 | Autenticación multifactor para usuarios internos | ⏳ Puerta S1 | TOTP de Supabase (gratuito) + exigencia `aal2` en RLS |
| 4 | Protección de credenciales y sesiones | ✅ Parcial | Sin `service_role` en la app; `getUser()`; cookies `httpOnly`; bloqueo de claves secretas públicas |
| 5 | Auditoría de modificaciones | ✅ Aplicado | `audit_logs` (sin valores personales) |
| 5b | Auditoría de consultas sensibles, descargas y exportaciones | ⏳ S1 / 2C | Lectura de `candidate_private` mediante función que registra el acceso |
| 6 | Restricción de exportaciones masivas | ✅ Por diseño | No existen exportaciones; fase 7: por rol, con límite, motivo y registro |
| 7 | Almacenamiento privado de documentos | ⏳ Fase 3 | Bucket privado, RLS, enlaces firmados de corta duración |
| 8 | Consentimiento informado y registro de autorizaciones | ⏳ 2C | Textos versionados; alta de candidato bloqueada sin consentimiento |
| 9 | Protección de formularios públicos y adjuntos | ⏳ Fase 3 | Anti-bots, límites de frecuencia, validación de tipo/tamaño, sin listados públicos |
| 10 | Prevención de filtraciones internas y externas | ✅ Parcial | CSP, cabeceras, errores sin detalles, datos sensibles separados (2C), registro de accesos |
| 11 | Protección de datos personales en IA | ⏳ Fase 5 | Minimización, seudonimización, revisión humana, sin datos reales en desarrollo |
| 12 | Copias de seguridad cifradas y recuperación verificada | ⏳ Puerta S1 | `pg_dump` cifrado programado + restauración probada en TEST |
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
| candidates | activos (banco de talento compartido) | admin, coordinador · reclutador (como responsable) | admin, coordinador · reclutador responsable | admin |
| applications | admin, coordinador, consulta · reclutador asignado | admin, coordinador · reclutador en su vacante | admin, coordinador · reclutador responsable (solo hacia vacantes asignadas) | admin |
| audit_logs | admin | — (solo triggers) | — | — |
| intake_channels (fuentes) | activos | admin | admin | — (se desactivan) |
| pipeline_templates / pipeline_stages | activos | admin, coordinador | admin, coordinador | admin, coordinador (nunca la predeterminada) |
| requirement_templates | activos | admin, coordinador | admin, coordinador | admin, coordinador |
| stage_catalog, job_positions, requirement_catalog, proficiency_scales, proficiency_levels | activos | admin, coordinador | admin, coordinador | — (se desactivan) |
| requirement_catalog_history | admin, coordinador | — (solo trigger) | — | — |

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
