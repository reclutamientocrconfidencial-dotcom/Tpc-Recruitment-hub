# Arquitectura — Fase 1

## Visión general

```
Navegador ──► Cloudflare Worker (Next.js vía OpenNext)
                 ├─ middleware.ts  → valida/refresca la sesión (Supabase Auth) y protege rutas
                 ├─ Server Components / Server Actions → consultas con la sesión del usuario
                 └─ Activos estáticos (binding ASSETS)
                                │
                                ▼
                        Supabase (PostgreSQL)
                 Auth  ·  RLS por rol y asignación  ·  bitácora
```

- **Todo el acceso a datos ocurre en el servidor** con la clave pública (`anon`) más el JWT del usuario,
  por lo que cada consulta queda sujeta a RLS. No existe ninguna ruta que use la clave `service_role`.
- La seguridad real vive en la base de datos; la interfaz solo oculta acciones no permitidas.

## Organización modular

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Rutas | `src/app/(app)/<modulo>/page.tsx` | Presentación de cada módulo |
| Datos | `src/modules/<modulo>/repository.ts` | Consultas a Supabase (o datos demo) |
| Dominio | `src/types/database.ts`, `src/modules/labels.ts` | Tipos, estados y etiquetas en español |
| Transversal | `src/lib/*` | Sesión, permisos, Supabase, formato, validación |
| UI | `src/components/*` | Componentes reutilizables (tabla, badges, tarjetas) |

Para agregar un módulo nuevo: tipos → migración + RLS → `repository.ts` → página → entrada en `nav.ts` → permiso en `permissions.ts` → pruebas.

## Modelo de datos

```
clients 1──* requisitions 1──* vacancies 1──* applications *──1 candidates
profiles (1 por usuario de Auth) ── asignaciones (recruiter_id, assigned_recruiter_id, owner_id)
audit_logs ← triggers en todas las tablas
```

- Códigos legibles autogenerados: `REQ-AAAA-00001`, `VAC-AAAA-00001`.
- `dashboard_metrics` es una vista con `security_invoker = true` (respeta RLS: cada rol ve sus propios números).
- Provincias de Costa Rica validadas con un dominio; monedas `CRC` y `USD`.

## Compatibilidad con Cloudflare

- Adaptador oficial `@opennextjs/cloudflare` (runtime Node.js de Workers con `nodejs_compat`).
- Sin dependencias nativas ni sistema de archivos; `next/image` sin optimizador (`images.unoptimized`).
- Sin fuentes remotas en tiempo de compilación (fuente del sistema).
- Tamaño verificado: ~1,3 MiB comprimido (límite del plan gratuito: 3 MiB).
- Sin caché incremental en R2/KV para no requerir servicios adicionales; puede habilitarse luego en `open-next.config.ts`.
- Verificado localmente con `wrangler dev` (workerd): login, redirecciones y módulos funcionan igual que en Node.
