# FleetHub — guía de demostración al cliente

Esta guía cubre el tenant de demo **`demo-a`** (empresa **BADAVI SL**). Los datos viven en PostgreSQL; no hay conectores en vivo con Uber, FreeNow, Bolt ni Cabify.

## Funciones de la especificación acordada — implementadas

Resumen de lo acordado en la especificación funcional y su estado en esta entrega:

| Área | Estado | Notas |
|------|--------|--------|
| **2FA (TOTP / Google Authenticator)** | ✅ Implementado | Activar y desactivar en **Ajustes**; obligatorio para Super Admin solo en producción |
| **Roles y permisos** | ✅ Implementado | Super Admin, Admin tenant, Gestor, Solo lectura; pruebas con usuarios demo |
| **Multi-tenant** | ✅ Implementado | Aislamiento por tenant; varias empresas por tenant; conductor en una empresa |
| **Alta de tenants** | ✅ Implementado | Super Admin o registro público (`/registro`) si `PUBLIC_SIGNUP_ENABLED=1` |
| **Usuario en varias empresas (mismo tenant)** | ✅ Implementado | Invitación con selección de empresas en **Configuración** |
| **Sesión 24 horas** | ✅ Implementado | Cookie de sesión con duración de 24 h |
| **Productividad y alertas** | ✅ Implementado | Umbrales en Configuración; badge en Conductores; panel en Dashboard |
| **Invitación de usuarios por email** | ✅ | Con `SMTP_*` en `.env` del API (Gmail u otro) |
| **Recuperación de contraseña por email** | ✅ | Misma configuración SMTP |
| **Integración Uber / FreeNow (cuenta paraguas)** | 🚫 Fuera de demo | Modelo acordado; sincronización en vivo no incluida en esta fase |

**Correo (SMTP):** las invitaciones y el “olvidé mi contraseña” envían email cuando el servidor tiene `SMTP_USER` y `SMTP_PASS` (y opcionalmente `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`). Sin esas variables, el usuario se crea igualmente pero el correo solo se registra en consola en desarrollo.

## Preparación (antes de la reunión)

```bash
cd fleethub
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Editar DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_* según README.md

npm install
npm run db:setup          # push + RLS + seed
npm run dev               # API + web
npm run test:acceptance   # opcional, valida RBAC/RLS
npm run demo:verify       # typecheck + acceptance (+ API smoke si el server responde en :4000)
npm run dev:server        # en otra terminal, si demo:verify omite el smoke
npm run test:smoke        # RBAC HTTP: admin / gestor / solo lectura
```

Abrir la URL de `NEXT_PUBLIC_APP_URL` (p. ej. `http://127.0.0.1:3000`).

### Checklist técnico (opcional)

Con el API en marcha (`npm run dev:server`), `npm run test:smoke` debe terminar en **RBAC API smoke OK** — valida login y permisos de escritura/lectura por rol.

## Credenciales

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin tenant | `admin-demoa@example.com` | `Demo1234!` |
| Gestor | `gestor-demoa@example.com` | `Demo1234!` |
| Solo lectura | `lectura-demoa@example.com` | `Demo1234!` |
| Super Admin plataforma | `superadmin@fleethub.local` | `Demo1234!` |

Login: solo **email + contraseña** (y 2FA si está activado). El operador se resuelve automáticamente por el email.

## Recorrido recomendado (Admin demo-a)

### 1. Dashboard operativa

- KPIs, gráfica de 14 días y top conductores desde viajes en BD (sin datos ficticios).
- Si no hay viajes recientes, los valores quedan en cero con mensaje informativo.

### 2. Operativa — turnos

- **Cerrar turnos**: resumen de liquidación, confirmación, **PDF** (vista previa o al cerrar) y export **Excel** en la cabecera.
- **Turnos cerrados**: export **Excel** además del CSV de viajes.
- **Turnos cerrados**: histórico liquidado; filtro por defecto **01/04/2026 – 31/05/2026** si no hay datos en pantalla. Ajustar fechas y plataforma.
- Expandir fila: detalle de viajes desde API (`/api/tenant/shifts/trips`) cuando hay `tripIds` reales.

### 3. Facturación, Analítica y Apps

Usar rango con volumen de seed:

- Facturación: `/facturacion?from=2026-04-01&to=2026-05-31`
- Analítica: `/analitica?from=2026-04-01&to=2026-05-31`

Tablas y totales salen de viajes cerrados en ese periodo (sin datos ficticios si el periodo está vacío).

**Apps** muestra la actividad del día actual por plataforma; si no hay viajes hoy, la tabla queda vacía con mensaje informativo.

### 4. Apps

Uso de plataformas hoy y umbrales de productividad (configurables en Configuración).

### 5. Conductores

- Listado: licencia, teléfono, plataformas desde BD.
- Detalle (p. ej. Carlos García): KPIs, tabla 7 días, pestañas de turnos cerrados.
- **Nuevo conductor**: formulario persiste en `POST /api/tenant/drivers` (Admin/Gestor).

### 6. Empresas

- **BADAVI SL**: perfil (dirección, contacto, banca) en `companies.profile`.
- **Gestión documental**: NDA y autorizaciones marcados firmados en seed; mandato SEPA pendiente. Admin puede subir PDF (máx. 5 MB), descargar y marcar firmado/pendiente.
- **Registro de actividad**: en **Configuración** (solo admin) — últimas acciones del tenant (login, cierres, usuarios, etc.).
- Edición y export CSV con columnas de contacto.

### 7. Configuración y Ajustes

- **Configuración**: umbrales de productividad (`PATCH /api/tenant/settings/productivity`), invitación de usuarios del tenant.
- **Ajustes**: perfil, cambio de contraseña y **2FA** (activar / desactivar con código TOTP o de respaldo).

## Demostración RBAC

1. Cerrar sesión e iniciar como **gestor-demoa@**: puede operar turnos y conductores; no accede a rutas de administración de tenant restringidas.
2. Iniciar como **lectura-demoa@**: solo lectura; botones de escritura deshabilitados u ocultos.
3. Super Admin **superadmin@fleethub.local** (tenant `platform`): listado de tenants, edición básica, creación de otro Super Admin de plataforma. Los usuarios de un tenant se invitan desde Configuración del tenant, no desde el formulario global simplificado.

## Exportaciones CSV

Desde listados de Empresas y Conductores (permiso de exportación según rol).

## Fuera de alcance en esta demo

- Sincronización real con APIs de plataformas y worker BullMQ con credenciales productivas.
- Firma electrónica avanzada (solo upload PDF + estado manual).
- Asignación cross-tenant de usuarios.

## Si faltan datos en pantalla

```bash
npm run seed -w @fleethub/db
```

Reiniciar sesión en `demo-a`. Comprobar que `DATABASE_URL` en web usa el rol `fleethub_app` tras `db:create-app-role`.
