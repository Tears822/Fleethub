# Pantalla 5 — Conductores (FRD §8)

**UI:** `/conductores` · ficha `/conductores/[id]`  
**Código:** `conductores-prototype-layout.tsx`, `conductor-detalle-view.tsx`, `drivers.queries.ts`

**Estado global (2026-05):** **Operativo v1** — listado y ficha con datos reales. Spec negocio columna a columna del cliente: **pendiente**; matriz inferida de implementación.

---

## Listado `/conductores`

| # | Campo | Implementación | Estado | Código |
|---|-------|----------------|--------|--------|
| 1 | Contador conductores | Filas visibles vs plantilla + activos | **Implementado** | `conductores-prototype-layout.tsx` |
| 2 | Buscar | Nombre, empresa, licencia | **Implementado** | `matchesSearchQuery` |
| 3 | Filtro Activo/Inactivo | `isActive` en maestro | **Implementado** | |
| 4 | Columna Estado | Punto verde/gris | **Implementado** | |
| 5 | Conductor | `fullName` | **Implementado** | |
| 6 | Empresa | `company.legalName` | **Implementado** | Scope shell |
| 7 | Plataformas | Iconos según `driver_platform_accounts` (Uber, FreeNow, Bolt, Cabify) | **Implementado** | `ridePlatformsToLogoIds` + `MockPlatformDots` |
| 8 | Productividad | Badge desde Apps (hoy) | **Implementado** | `driver-productivity.queries.ts` |
| 9 | Acciones | Ver ficha | **Implementado** | `ErpEyeLink` |
| 10 | Nuevo conductor | RBAC gestores | **Implementado** | `canManageDrivers` |
| 11 | Export CSV | `conductores.csv` | **Implementado** | Cabecera shell |

---

## Ficha `/conductores/[id]`

| Tab | Contenido | Estado |
|-----|-----------|--------|
| Datos | DNI, teléfono, email, licencia, vehículo, alta | **Implementado** |
| Vehículos | Historial asignaciones | **Implementado** |
| Rendimiento | KPIs conductor (viajes cerrados) | **Implementado** |
| Turnos cerrados | Enlace a `/turnos-cerrados?shift=` | **Implementado** |
| Configuración económica | Reparto %, primas, comisión plataforma, fijo diario | **Implementado** |

---

## Gaps (priorizado)

| Prioridad | Gap | Esfuerzo |
|-----------|-----|----------|
| **P1** | Spec negocio cliente (Excel pantalla 5) | Producto |
| ~~P2~~ | ~~Iconos Bolt/Cabify en listado/ficha~~ | Hecho 2026-05 |
| **P2** | Estado «conectado ahora» vía API plataforma | Alto — FRD §5 |
| **P3** | Entidad turno en ficha (apertura/cierre) | Modelo turno |

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Matriz técnica listado + ficha desde código existente |
| 2026-05 | Iconos Bolt/Cabify en listado y ficha (datos) |
