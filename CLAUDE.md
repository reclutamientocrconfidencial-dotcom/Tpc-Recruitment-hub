# CLAUDE.md — TPC Recruitment Hub

ATS empresarial de **The People Outsourcing Company S.A.** (Costa Rica). Next.js 15 + TypeScript + Tailwind 4,
Supabase (PostgreSQL, Auth, RLS) y Cloudflare Workers (OpenNext). Interfaz y documentación **en español**.

Plan maestro: [`docs/PROXIMOS_PASOS.md`](docs/PROXIMOS_PASOS.md) · Política de seguridad: [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) · Manual: [`docs/manual/`](docs/manual/README.md)
· Operación e incidentes: [`docs/OPERACION.md`](docs/OPERACION.md)
· Despliegue: [`docs/DESPLIEGUE_PRODUCCION.md`](docs/DESPLIEGUE_PRODUCCION.md) · Revisión de seguridad: [`docs/REVISION_SEGURIDAD.md`](docs/REVISION_SEGURIDAD.md).

---

## 1. Seguridad y privacidad desde el diseño (OBLIGATORIO en todo cambio)

Toda funcionalidad nueva se diseña, implementa y prueba bajo **Security & Privacy by Design**. Un cambio que no
cumpla estos puntos no está terminado.

1. **Mínimo privilegio.** Cada rol (`admin`, `coordinador`, `reclutador`, `consulta`) recibe solo lo que necesita.
   Ante la duda, se niega. El rol `consulta` nunca ve datos sensibles de candidatos.
2. **RLS siempre.** Toda tabla en `public` tiene RLS habilitado **y forzado**, `anon` sin privilegios, y políticas
   explícitas por operación. La interfaz oculta acciones, pero **la base de datos decide**.
3. **Validación en servidor.** Server Actions verifican sesión, rol (`authorizeAction`) y datos (Zod). Las reglas de
   negocio críticas viven en la base de datos (triggers, funciones, restricciones).
4. **Sin secretos en el cliente ni en el repositorio.** Nunca usar la clave `service_role`/`sb_secret_` en la
   aplicación. Variables públicas solo `NEXT_PUBLIC_*` no sensibles.
5. **Sesiones y credenciales protegidas.** Validar sesión con `supabase.auth.getUser()`; cookies `httpOnly`;
   autenticación multifactor obligatoria para usuarios internos antes de cargar datos reales.
6. **Trazabilidad.** Bitácora de cambios (sin valores personales); consultas a datos sensibles, descargas y
   exportaciones deben quedar registradas.
7. **Exportaciones restringidas.** Nada de exportaciones masivas sin rol autorizado, límite, motivo y registro.
8. **Documentos privados.** Archivos en almacenamiento privado con RLS y enlaces firmados de corta duración.
9. **Consentimiento informado.** Ningún candidato sin consentimiento vigente y versionado (Ley 8968).
10. **Formularios públicos protegidos.** Anti-bots, límites de frecuencia, validación de archivos (tipo, tamaño),
    sin exponer datos de otros candidatos.
11. **IA con datos mínimos.** Solo los campos necesarios, seudonimizados cuando sea posible, revisión humana
    obligatoria, registro de uso y costos. **Nunca** datos personales reales en IA durante el desarrollo.
12. **Respaldos cifrados y recuperación verificada.** Ver fase 8.
13. **Dependencias y pruebas de seguridad automatizadas.** `npm audit`, lint de Supabase y pruebas RLS en CI.
14. **Errores sin filtrar información.** Mensajes en español, sin SQL, tablas ni trazas (`dbErrorMessage`).
15. **Cumplimiento.** Ley N.° 8968 de Costa Rica y su reglamento, **sujeto a revisión jurídica**.

## 2. Restricciones de desarrollo

- **TEST y producción completamente separados.** Proyectos Supabase y Workers distintos. Antes de ejecutar SQL,
  confirmar el nombre del proyecto.
- **Solo datos ficticios** en desarrollo y pruebas (correos `*.test`, cédulas ficticias).
- **Nunca modificar una migración ya aplicada** en TEST o producción: crear una migración incremental nueva.
- Migraciones **aditivas y compatibles** con el código anterior; cada una con consulta de verificación en
  `supabase/verification/` e instrucciones de reversión en `docs/OPERACION.md`.
- Mantener compatibilidad con las funcionalidades existentes.
- Priorizar herramientas gratuitas sin comprometer la seguridad; no contratar servicios sin autorización.
- **No modificar producción ni fusionar PR sin autorización expresa del usuario.**
- **Suspender cualquier despliegue** si existen riesgos críticos o altos sin resolver.

## 3. Comandos

| Comando | Uso |
|---|---|
| `npm run lint` · `npm run typecheck` | Calidad de código |
| `npm test` | Unitarias (Vitest) |
| `npm run test:db` | Migraciones + pruebas RLS en PostgreSQL local efímero |
| `npm run test:e2e` | E2E en modo demostración |
| `npm run test:e2e:supabase` | E2E con Supabase local (Docker) y Auth real — ver README |
| `npm run cf:build` | Compilación para Cloudflare Workers |

Antes de entregar: `npm audit --audit-level=high`, lint, tipos, unitarias, `test:db`, build y E2E en verde.

## 4. Convenciones

- Módulos en `src/modules/<módulo>/` (`schema.ts`, `repository.ts`, `actions.ts`, componentes). Las páginas no
  consultan la base de datos directamente.
- Formularios: `useActionState` + Server Action que devuelve `ActionState`; componentes de `src/components/ui/form.tsx`.
- Listados: filtros en la URL (`FilterBar`), paginación en servidor (`Pagination`, 25 por página).
- Catálogos: **no se borran**, se desactivan (`is_active`); sin permiso `DELETE` y con FK `RESTRICT`.
- Diseño corporativo rojo / blanco / negro; accesible por teclado; utilizable en celular.
