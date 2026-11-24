# TPC Recruitment Hub

> Políticas obligatorias de seguridad y desarrollo: [`CLAUDE.md`](CLAUDE.md).

Sistema de seguimiento de candidatos (ATS) de **The People Outsourcing Company S.A.** (Costa Rica).

> **Estado:** Fase 1 — base técnica, autenticación, dashboard, estructura de datos y seguridad (RLS).
> Los formularios de alta/edición y los flujos de negocio corresponden a fases posteriores.

![Dashboard](docs/capturas/dashboard.png)

## Tecnologías (todas con plan gratuito)

| Capa | Herramienta |
| --- | --- |
| Frontend / SSR | Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 |
| Base de datos y autenticación | Supabase (PostgreSQL + Auth + RLS) |
| Hospedaje | Cloudflare Workers mediante `@opennextjs/cloudflare` |
| Pruebas | Vitest (unitarias), PostgreSQL / Supabase local (RLS), Playwright (E2E) |
| CI | GitHub Actions |

## Requisitos

- Node.js 20.9 o superior (recomendado 22) y npm.
- Una cuenta gratuita de [Supabase](https://supabase.com) (para datos reales).
- Una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com) (para publicar).
- Opcional: PostgreSQL 15+ instalado localmente para `npm run test:db`.

## Inicio rápido (modo demostración, sin Supabase)

Muestra la interfaz con **datos ficticios**, sin conectarse a ninguna base de datos:

```bash
npm install
```

```bash
TPC_DEMO_MODE=true npm run dev
```

Abra http://localhost:3000 e ingrese con `demo@tpc-demo.test` / `DemoTPC2026`.

> El modo demostración solo se activa si `TPC_DEMO_MODE=true` **y** Supabase **no** está configurado.
> Nunca puede convivir con datos reales.

## Instalación con Supabase

### 1. Crear el proyecto

1. En Supabase cree un proyecto nuevo (región sugerida: `us-east-1`, la más cercana a Costa Rica).
2. En **Authentication → Sign In / Providers**:
   - Mantenga habilitado **Email**.
   - **Desactive "Allow new users to sign up"**: los usuarios los crea o invita un administrador.
3. En **Authentication → URL Configuration** defina la *Site URL* (p. ej. `http://localhost:3000` en desarrollo
   y la URL de Cloudflare en producción) y agregue `<sitio>/auth/confirm` a las *Redirect URLs*.

### 2. Aplicar las migraciones

**Opción A — Supabase CLI (recomendada, ya incluida en el proyecto):**

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ID_DEL_PROYECTO>
```

```bash
npx supabase db push
```

**Opción B — SQL Editor:** ejecute en orden los archivos de `supabase/migrations/` (del `0100` al `0810`) y luego
las consultas de `supabase/verification/`.

> `db push` **no** carga `supabase/seed.sql`. Ese archivo (datos ficticios) es solo para el entorno local:
> no lo ejecute en el proyecto de producción.

Si ya había aplicado las migraciones `0100`–`0600`, vuelva a ejecutar `npx supabase db push`:
solo aplicará la `0700` (endurecimiento de seguridad).

Verifique luego en el panel **Advisors → Security Advisor** que no haya alertas.

### 3. Crear el primer administrador

1. En **Authentication → Users → Add user** cree el usuario (correo y contraseña).
   Se crea automáticamente su perfil con el rol `consulta` (mínimo privilegio).
2. En el **SQL Editor** promuévalo a administrador:

```sql
update public.profiles set role = 'admin', full_name = 'Nombre Apellido'
where email = 'correo@su-dominio.com';
```

Los demás roles (`coordinador`, `reclutador`, `consulta`) se asignan igual; en la fase 2 habrá una
pantalla de gestión de usuarios.

### 4. Variables de entorno

```bash
cp .env.example .env.local
```

Complete `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(Panel → Project Settings → API Keys → *Publishable key*, empieza con `sb_publishable_`).
Los proyectos antiguos pueden usar en su lugar `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave `anon`).

La *Secret key* (`sb_secret_…`) y la `service_role` **no se usan**: si se colocan por error en una variable
pública, la aplicación se niega a iniciar.

```bash
npm run dev
```

## Publicar en Cloudflare Workers (plan gratuito)

```bash
npx wrangler login
```

Las variables `NEXT_PUBLIC_*` se incrustan **al compilar**, por lo que deben existir en `.env.local`
(o en el entorno de CI) al ejecutar:

```bash
npm run cf:deploy
```

Vista previa local en el runtime real de Cloudflare (workerd): copie `.dev.vars.example` a `.dev.vars` y ejecute

```bash
npm run cf:preview
```

Si conecta el repositorio con **Workers Builds** de Cloudflare, defina las mismas variables en
*Settings → Variables and Secrets* (tipo *build*) y use `npx opennextjs-cloudflare build` como comando de compilación
y `npx opennextjs-cloudflare deploy` como comando de despliegue.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (Next.js) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:db` | Migraciones + seed + pruebas RLS en un PostgreSQL local efímero |
| `npm run test:e2e` | Pruebas de extremo a extremo (Playwright, modo demostración) |
| `npm run test:e2e:supabase` | E2E contra Supabase **local** con usuarios ficticios (ver abajo) |
| `npm run cf:build` / `cf:preview` / `cf:deploy` | Compilar, previsualizar y publicar en Cloudflare |

## Probar con Supabase local (Docker, gratuito)

Levanta Postgres + Auth + API de Supabase en su equipo, aplica las migraciones y carga los datos ficticios:

```bash
npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,realtime,supavisor,postgres-meta,mailpit
```

Pruebas RLS sobre el Postgres de Supabase:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/rls-tests/rls_test.sql
```

E2E con inicio de sesión real (crea usuarios ficticios `*@tpc-demo.test` solo en el stack local):

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')" && NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY npm run build && SUPABASE_URL=$API_URL SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY SUPABASE_SECRET_KEY=$SECRET_KEY npm run test:e2e:supabase
```

El script de preparación se niega a ejecutarse contra una URL que no sea `localhost`/`127.0.0.1`.

## Funcionalidades (fase 2A)

- **Clientes:** alta, edición, desactivación, detalle con requisiciones y vacantes abiertas, búsqueda por nombre o
  cédula jurídica, filtros (estado, provincia, industria) y paginación en servidor (25 por página).
- **Configuración por cliente y puesto:** etapas elegidas del catálogo (categoría y tipo automáticos), procesos
  por puesto, requisitos con nivel mínimo de dominio, copiar la configuración de otro cliente.
- **Catálogos** (activar/desactivar sin perder historial): etapas, puestos (con buscador, abierto), requisitos y
  escalas de niveles de dominio.
- **Administración:** usuarios y roles (solo admin), proceso estándar TPC y requisitos globales, fuentes de recepción.
- **Monitoreo:** `GET /api/salud` (sin datos personales).

## Funcionalidades (fase 2B)

- **Requisiciones:** alta y edición con cliente y puesto de los catálogos, plazas, ubicación, modalidad, horario,
  salario, responsable, prioridad y fecha límite. Flujo borrador → pendiente de aprobación → aprobada → en proceso →
  cerrada (o cancelada), validado por la base de datos, que registra quién aprobó.
- **Vacantes:** se crean desde requisiciones aprobadas (heredan sus datos), proceso y requisitos personalizables por
  vacante (o heredados: cliente+puesto → cliente → puesto → estándar), duplicación en la misma u otra requisición,
  seguimiento de plazas cubiertas/pendientes con estado «Cubierta» automático.
- **Plazas autorizadas:** el avance de la requisición se calcula sobre sus plazas autorizadas, sin contar vacantes en
  borrador; no se puede publicar una vacante que exceda las plazas disponibles (validado también en la base de datos).
- **Filtros** en la URL (estado, prioridad, cliente, responsable, modalidad, provincia, vencidas, con plazas
  pendientes) y paginación en servidor.
- **Permisos:** el reclutador asignado solo actualiza estado y plazas cubiertas; `consulta` solo lectura.
- **Catálogo de requisitos editable** (nombre, categoría, escala, descripción) con historial de cambios; los
  requisitos ya configurados reciben el cambio automáticamente.

## Estructura

```
src/
  app/                 Rutas (App Router)
    login/             Inicio de sesión (Server Action + validación Zod)
    auth/confirm/      Verificación de enlaces de Supabase (invitación / recuperación)
    (app)/             Área protegida: dashboard y módulos
  components/          UI reutilizable (ui/) y estructura (layout/)
  lib/                 Supabase, sesión, permisos, formato, validación, entorno, datos demo
  modules/             Acceso a datos por módulo (clientes, requisiciones, vacantes, candidatos, postulaciones)
  middleware.ts        Protección de rutas y refresco de sesión
  types/               Tipos de dominio
supabase/
  migrations/          Esquema, roles, RLS, auditoría, vistas
  config.toml          Configuración del stack local (registro público deshabilitado)
  seed.sql             Datos ficticios (solo local)
  rls-tests/           Pruebas RLS (SQL)
tests/e2e/             Pruebas Playwright (modo demostración)
tests/e2e-supabase/    Pruebas Playwright contra Supabase local
docs/                  Arquitectura, seguridad y próximos pasos
```

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — diseño modular y compatibilidad con Cloudflare.
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — roles, matriz de permisos, RLS y Ley 8968.
- [docs/PROXIMOS_PASOS.md](docs/PROXIMOS_PASOS.md) — propuesta para las siguientes fases.
- [docs/FASE2_PLAN.md](docs/FASE2_PLAN.md) — plan aprobado de la fase 2.
- [docs/OPERACION.md](docs/OPERACION.md) — manual de operación: ambientes, monitoreo, reversión e incidentes.
