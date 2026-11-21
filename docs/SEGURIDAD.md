# Seguridad y permisos

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
| requisitions | admin, coordinador, consulta · reclutador asignado | admin, coordinador | admin, coordinador | admin |
| vacancies | admin, coordinador, consulta · reclutador: asignadas o abiertas | admin, coordinador | admin, coordinador · reclutador asignado | admin |
| candidates | activos (banco de talento compartido) | admin, coordinador · reclutador (como responsable) | admin, coordinador · reclutador responsable | admin |
| applications | admin, coordinador, consulta · reclutador asignado | admin, coordinador · reclutador en su vacante | admin, coordinador · reclutador responsable | admin |
| audit_logs | admin | — (solo triggers) | — | — |

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
- Sin credenciales en el repositorio (`.env*` y `.dev.vars` ignorados).

## Ley N.° 8968 (Protección de datos personales)

- Campos `consent_given` / `consent_at` en candidatos (restricción: consentimiento implica fecha).
- La bitácora no duplica datos personales.
- Borrado de un candidato elimina en cascada sus postulaciones (derecho de supresión; solo admin).
- Pendiente (fase 2+): texto de consentimiento, política de retención y exportación de datos del titular.

## Verificación

`npm run test:db` ejecuta 55 aserciones sobre estas reglas en un PostgreSQL local (ver `supabase/tests/rls_test.sql`).
