# FleetHub — monorepo (Hito 2)

Stack: **Next.js (App Router) + TypeScript**, **PostgreSQL + Prisma + RLS**, **Redis** (cola / worker), monorepo npm workspaces.

## Requisitos

- Node.js 20+
- Docker (solo **Postgres + Redis** en `docker-compose.yml`; Next y Prisma se ejecutan en el **host** con Node, salvo que añadas tú un servicio de app en Docker)

## Arranque rápido

### 1. Clonar variables de entorno

```bash
cd fleethub
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edita **`fleethub/.env`** y **`apps/web/.env.local`**:

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` (raíz `fleethub/.env`) | Usuario **fleethub** (owner): `db:push`, RLS, seed, `create-app-role`. No uses solo `fleethub_app` aquí. |
| `DATABASE_URL` en `apps/web/.env.local` | Usuario **`fleethub_app`** tras `db:create-app-role`: Next aplica RLS en runtime. |
| `REDIS_URL` | Colas worker |
| `AUTH_SECRET` | JWT cookie (≥32 caracteres) |
| `NEXT_PUBLIC_APP_URL` | Origen público del sitio (`https://tu-dominio`). Debe coincidir con la URL del navegador para metadatos y enlaces. |
| `NEXT_PUBLIC_SERVER_URL` | **Obligatoria** — URL base del API `@fleethub/server` (sin barra final). Next **reenvía** `/api/*` a este origen (`next.config.ts`). En local: `http://127.0.0.1:4000`. Sin esta variable, `next dev` / `next build` fallan al cargar la config. |

### 2. Instalar dependencias

```bash
cd fleethub
npm install
```

### 3. Crear base de datos (Docker + Prisma + RLS + seed)

Un solo comando (requiere `.env` en `fleethub/` con `DATABASE_URL`):

```bash
cd fleethub
chmod +x scripts/db-setup.sh   # solo la primera vez
npm run db:setup
```

Equivale a: `docker compose up -d` → esperar Postgres → `db:push` → `db:apply-rls` → `db:seed`. Luego crea el rol de app: `npm run db:create-app-role` (incluye permiso `EXECUTE` sobre `app_lookup_tenant_by_slug`, necesario para login y `test:tenant` con `fleethub_app`).

Si ya tenías la base creada y has hecho `git pull` con cambios en `apply-rls.sql` / `create-app-role.sql`, vuelve a ejecutar **`npm run db:apply-rls`** y **`npm run db:create-app-role`** (con `DATABASE_URL` de usuario `fleethub` en la raíz).

### 4. Prueba de aislamiento entre tenants

Con **`fleethub/.env`** en usuario **fleethub** (como tras `db:setup`), el check suele salir código **2**: superuser/owner no aplica RLS.

Para comprobar políticas con el rol de aplicación **sin** tocar el `.env` de la raíz:

```bash
cd fleethub
DATABASE_URL="postgresql://fleethub_app:fleethub_app@localhost:5432/fleethub?schema=public" npm run test:tenant -w @fleethub/db
```

(Tras `npm run db:create-app-role`.) El servidor Next ya usa `fleethub_app` en `apps/web/.env.local` para runtime con RLS.

Atajo: `npm run test:tenant:rls` (misma comprobación sin exportar `DATABASE_URL`).

`npm run db:setup` ahora incluye `db:create-app-role` y `test:tenant:rls` al final.

### 4b. Aceptación (pre-deploy)

```bash
cd fleethub
npm run verify:deploy          # .env: fleethub vs fleethub_app, AUTH_SECRET, URLs
npm run test:acceptance        # rbac + verify + RLS; API smoke si /health responde
npm run demo:verify            # typecheck + acceptance + API smoke si :4000/health responde
npm run test:smoke             # RBAC HTTP (requiere npm run dev:server)
# Con API en marcha (npm run dev:server):
npm run test:smoke             # admin / gestor / solo lectura vía HTTP
```

Seed **solo lectura**: `demo-a` / `lectura-demoa@example.com` / `Demo1234!` (tras `db:seed`).

### 5. App web + API (Next + `@fleethub/server`)

El login y `/api/*` los sirve el proceso **`@fleethub/server`**. El navegador llama a rutas relativas **`/api/...`** en el mismo host que Next; **`next.config.ts`** las reenvía a **`NEXT_PUBLIC_SERVER_URL`**.

Desde la raíz del monorepo (recomendado — levanta API + Next):

```bash
cd fleethub
npm run dev
```

Tras `npm run build`, **`npm run start`** en la raíz arranca **API + Next** igual que en desarrollo (no solo Next).

- Asegúrate de que **`apps/web/.env.local`** define **`NEXT_PUBLIC_SERVER_URL`** (p. ej. `http://127.0.0.1:4000`, misma URL que escucha el API).
- Si ejecutas solo `npm run dev -w @fleethub/web`, Next **igual exige** `NEXT_PUBLIC_SERVER_URL` en la config; además el API debe estar en marcha o el login fallará en runtime.

Abre la URL de `NEXT_PUBLIC_APP_URL`. Tras seed, login demo:

- Tenant: `demo-a`
- Email: `admin-demoa@example.com`
- Contraseña: `Demo1234!`

Guía de demostración al cliente (recorrido, roles, URLs): [`docs/CLIENT-DEMO.md`](./docs/CLIENT-DEMO.md).

Implementation checklist (English, feature-by-feature): [`docs/IMPLEMENTATION-CHECKLIST.md`](./docs/IMPLEMENTATION-CHECKLIST.md).

**Data spec by screen (business formulas vs code):** [`docs/especificacion-datos/`](./docs/especificacion-datos/) — Pantalla 1 Dashboard filled (Mar 2026).

Spec verification (2FA, roles, multi-tenant, sessions): [`docs/SPEC-VERIFICATION-CHECKLIST.md`](./docs/SPEC-VERIFICATION-CHECKLIST.md).

### 6. HTTPS y nginx (activex.rest)

1. **`apps/web/.env.local`**: `NEXT_PUBLIC_APP_URL=https://activex.rest` (browser). **`NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:4000`** — internal `@fleethub/server` on the same host. **Do not** set `NEXT_PUBLIC_SERVER_URL` to `https://api.activex.rest` when nginx already sends `api.*` to Next; that creates a rewrite loop and login fails with **431**.
2. Nginx: termina TLS en `activex.rest` y hace `proxy_pass` a Next (**3000**). El API (`@fleethub/server`, **4000**) no necesita ser público si Next reescribe `/api/*` a `127.0.0.1:4000`. El bloque `api.activex.rest` es opcional.
3. En **`apps/server/.env`**, **`WEB_ORIGIN`** debe incluir el origen exacto del navegador (p. ej. `https://activex.rest`) para CORS en credenciales. Si API y web usan subdominios distintos, revisa **`SESSION_COOKIE_DOMAIN`** y **`FORCE_COOKIE_SECURE`** (ver `apps/server/.env.example`).
4. Si nginx devuelve **400/431 headers too large**: sube buffers (`client_header_buffer_size 16k;` `large_client_header_buffers 4 128k;`), corrige **`NEXT_PUBLIC_SERVER_URL`**, borra cookies de `activex.rest`, y vuelve a desplegar. Ejemplo: [`docs/nginx-activex.rest.conf`](./docs/nginx-activex.rest.conf).

### 7. Worker (humo Redis/BullMQ)

Claves opcionales **Uber / FreeNow** (Hito 3): `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `FREENOW_CLIENT_ID`, `FREENOW_CLIENT_SECRET` en el `.env` de la raíz del monorepo (plantilla en `.env.example`). El worker carga ese `.env` y, al arrancar, indica si la integración está lista (sin volcar secretos).

```bash
cd fleethub
set -a && source .env && set +a
npm run worker
```

## UI de referencia

Estilos y tokens tomados de **`UI_Refrence/vision-ui-dashboard-react`** (Creative Tim — `src/assets/theme/base/colors.js`, gradientes `sidenav` / `cover` / `cardDark`, sombras `xxl`, sidebar 250px, filas de tabla tipo `grey[700]`, tarjetas estilo `MiniStatisticsCard`). El **`body`** usa la clase **`vision-body-canvas`**: gradiente azul / violeta tipo demo Vision + imagen de fondo global (como `globals.js` con `body-background.png`), con los coches transparentes en **`apps/web/assets/ad-img*.png`** copiados a **`apps/web/public/images/vision/`** para URLs estáticas. Si sustituyes los PNG en `assets/`, vuelve a copiarlos a `public/images/vision/`. Fuente **Plus Jakarta Sans**. No se embebe MUI: es una **reimplementación Tailwind**; un clon 1:1 de cada componente MUI exigiría integrar el stack MUI del template en Next.

## Estructura

| Ruta | Descripción |
|------|-------------|
| `apps/web` | Next.js: `domain`, `features`, `infrastructure`, `shared` |
| `apps/server` | API HTTP (auth, futuro REST) — **obligatorio** para `/api/*` |
| `apps/worker` | Worker Redis / BullMQ |
| `packages/db` | Prisma, `withTenant`, seed, SQL RLS |
| `packages/auth` | Login JWT + cookies compartidos con web y API |
| `packages/contracts` | Contratos compartidos |
| `packages/tsconfig` | Bases TypeScript |

**Arquitectura:** [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Contrato Hito 2

Ver `docs/milestone-02/ENTREGABLE-HITO-2.md`.
