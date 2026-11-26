# Revisión integral de seguridad — TPC Recruitment Hub

**Fecha:** 26/11/2026 · **Alcance:** código de la aplicación (fases 1 a 8 y mejoras 4/5), base de datos (migraciones
0100–1800), CI/CD, respaldos y configuración de Cloudflare. **Ambiente revisado:** Supabase local y TEST, solo datos
ficticios. **Política aplicada:** [SEGURIDAD.md](SEGURIDAD.md) (Security & Privacy by Design).

> Conclusión: **no hay hallazgos críticos ni altos abiertos.** Se corrigió un hallazgo bajo (descargas iniciadas desde
> otros sitios). Lo que falta para usar datos reales son **decisiones y configuraciones de la empresa**, listadas en
> la sección 4 y en [DESPLIEGUE_PRODUCCION.md](DESPLIEGUE_PRODUCCION.md).

## 1. Cómo se revisó

| Verificación | Herramienta | Resultado |
|---|---|---|
| RLS habilitado **y forzado** en todas las tablas de `public`; `anon` sin privilegios | `supabase/verification/auditoria_seguridad.sql` | ok |
| Funciones `SECURITY DEFINER` con `search_path` fijo | auditoría SQL + linter de Supabase | ok |
| Esquema `private` inaccesible por la API | auditoría SQL | ok |
| Funciones ejecutables sin sesión: solo las previstas (formulario público, carga del CV con token de un uso, calendario con enlace secreto, salud) | auditoría SQL | ok (6) |
| Almacenamiento privado (sin buckets públicos) | auditoría SQL | ok |
| Políticas por rol y operación | 585 pruebas RLS (incluye consulta, reclutador ajeno, anon) | ok |
| Linter de esquema de Supabase (nivel advertencia) | `supabase db lint` | sin hallazgos |
| Dependencias | `npm audit --audit-level=high` · Dependabot mensual | 0 vulnerabilidades |
| Autorización en servidor | revisión de todas las acciones (`"use server"`) y rutas `/api` | todas verifican sesión y rol (`authorizeAction` o equivalente) |
| Secretos | búsqueda en el código y la configuración | ninguna clave `service_role`/`sb_secret_` en la aplicación; la app la rechaza si se configura por error |
| Contenido inyectado (XSS) | revisión de `dangerouslySetInnerHTML` | único uso: SVG del QR generado en el servidor con título saneado |
| Cabeceras | `next.config.ts` | CSP restrictiva, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, sin `X-Powered-By` |
| Extremo a extremo | 77 pruebas E2E con Auth real (Next y workerd) + 33 en demostración | ok |
| Recuperación | respaldo cifrado → restauración (base y archivos) | ok |

## 2. Controles verificados por área

- **Identidad y sesiones:** `getUser()` en servidor, cookies `httpOnly`, cierre por inactividad, verificación en dos
  pasos (aal2) exigible a todo el equipo y obligatoria para cambios sensibles (IA externa, seguridad).
- **Mínimo privilegio:** cuatro roles; «consulta» nunca ve datos sensibles; el reclutador solo lo asignado; la BD
  decide aunque la interfaz oculte acciones.
- **Trazabilidad:** bitácora de cambios sin valores personales; registro de consultas sensibles, descargas de
  currículums, exportaciones, informes y ternas **antes** de entregar el archivo.
- **Formularios públicos:** clave de servidor (solo huella en la BD), límites de frecuencia diarios, validación de
  tipo real y tamaño de archivos, token de carga de un solo uso, sin exposición de otros candidatos.
- **IA:** apagada por omisión; proveedor externo solo con acuerdo de tratamiento, presupuesto y aal2;
  seudonimización; revisión humana obligatoria; sin decisiones automáticas; salvaguarda contra preguntas
  discriminatorias; límites diarios, presupuesto mensual y tope por lote.
- **Exportaciones:** rol autorizado, motivo, 5.000 filas, 20 por día, sin identificación ni contacto, neutralización
  de fórmulas, verificación de origen.
- **Respaldos:** diarios, cifrados con clave pública (la privada fuera de GitHub), base y archivos, restauración
  probada en cada cambio; el script de restauración se niega a escribir en servidores remotos.

## 3. Hallazgos

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Baja | Las rutas de descarga (informes, ternas, currículums, ICS) aceptaban solicitudes iniciadas desde otro sitio: un enlace externo podía provocar una descarga y un registro de acceso con la sesión del usuario. | **Corregido**: se rechazan con `Sec-Fetch-Site: cross-site` (`src/lib/http/same-site.ts`). |
| 2 | Baja | Seudonimización: un apellido que también es palabra común alteraba el texto profesional. | **Corregido** (mejoras 4/5). |
| 3 | Media (operativa) | Sin monitoreo programado ni prevención de la pausa de Supabase gratuito. | **Corregido**: monitoreo cada 30 min con aviso automático y `public.salud()` (migración 1800). |
| 4 | Media (operativa) | Los currículums del almacenamiento no se respaldaban. | **Corregido**: respaldo cifrado de archivos con credencial solo de Storage y prueba de recuperación en CI. |
| 5 | Informativo | Las funciones del formulario público son accesibles sin sesión por diseño. | Aceptado: protegidas por clave de servidor, límites y token de un uso (pruebas RLS y E2E). |
| 6 | Informativo | El enlace del calendario es público por diseño (las apps de calendario no inician sesión). | Aceptado: enlace de 256 bits revocable, sin datos de candidatos. |

## 4. Riesgos residuales que dependen de la empresa (bloquean datos reales)

1. **Verificación en dos pasos** configurada y **exigida** a todos los usuarios internos, y activada en las cuentas de
   GitHub, Supabase y Cloudflare (al menos dos administradores por servicio).
2. **Revisión jurídica (Ley 8968):** texto de consentimiento, finalidades, plazos de **retención** y eliminación,
   inscripción de la base ante la PRODHAB si corresponde, y aprobación del protocolo de incidentes.
3. **Respaldos en producción configurados** (clave GPG con dos custodios, credenciales, secretos) y una restauración
   de prueba documentada.
4. **IA externa:** solo con acuerdo de tratamiento de datos firmado, presupuesto aprobado y secreto en el Worker.
5. **Retención:** la aplicación conserva los datos hasta que se definan plazos; la eliminación automática se
   implementará cuando la empresa los apruebe.

## 5. Repetir esta revisión
- Antes de cada despliegue a producción y **trimestralmente**: `auditoria_seguridad.sql` en TEST y producción,
  revisión de usuarios y roles, y del registro de accesos (ver [OPERACION.md](OPERACION.md) §13).
- En cada cambio, la CI ejecuta auditoría de dependencias, linter de Supabase, pruebas RLS, E2E y recuperación.
