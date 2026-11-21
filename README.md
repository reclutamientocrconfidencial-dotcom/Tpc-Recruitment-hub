# TPC Recruitment Hub

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
| Pruebas | Vitest (unitarias), PostgreSQL local (RLS), Playwright (E2E) |
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

**Opción A — Supabase CLI (recomendada):**

```bash
npx supabase init
```

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ID_DEL_PROYECTO>
```

```bash
npx supabase db push
```

**Opción B — SQL Editor:** ejecute en orden los archivos de `supabase/migrations/` (del `0100` al `0600`).

Datos ficticios opcionales para pruebas: ejecute `supabase/seed.sql` (**no** lo cargue en producción).

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

Complete `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Panel → Project Settings → API).
La clave `service_role` **no se usa** y nunca debe colocarse en el frontend.

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
| `npm run cf:build` / `cf:preview` / `cf:deploy` | Compilar, previsualizar y publicar en Cloudflare |

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
  seed.sql             Datos ficticios
  tests/               Pruebas RLS (SQL)
tests/e2e/             Pruebas Playwright
docs/                  Arquitectura, seguridad y próximos pasos
```

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — diseño modular y compatibilidad con Cloudflare.
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — roles, matriz de permisos, RLS y Ley 8968.
- [docs/PROXIMOS_PASOS.md](docs/PROXIMOS_PASOS.md) — propuesta para las siguientes fases.
