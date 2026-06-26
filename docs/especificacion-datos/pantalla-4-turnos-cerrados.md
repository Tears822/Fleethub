# Turnos cerrados (operativa)

**Nota:** En el Excel de negocio «5 pantallas», **Facturación** es la pantalla 4 → ver [pantalla-4-facturacion.md](./pantalla-4-facturacion.md). Este documento es el **historial de liquidaciones en caja** (complemento de [pantalla-3-cerrar-turnos.md](./pantalla-3-cerrar-turnos.md)).

**UI:** `/turnos-cerrados`  
**Título:** Historial de liquidaciones  
**Código:** `closed-shifts.queries.ts`, `closed-shifts-from-events.ts`, `turnos-cerrados-mock-view.tsx`, `shift_liquidations` (Prisma)

**Estado global (2026-05):** **Operativo v1** — listado real por liquidación, filtros, exportaciones y enlace desde ficha conductor. Spec negocio columna a columna: **pendiente** (plantilla cliente); matriz inferida desde implementación y Pantalla 3.

**Modelo:** una fila = un evento de **liquidación en caja** (`shift_liquidations` o fallback auditoría `shift.close`). Viajes incluidos tienen `liquidationStatus = closed`. Multi-plataforma: filas expandidas por plataforma (`expandShiftRowsForTable`).

**Alcance de fechas:** el periodo URL (`?from=&to=`) filtra por **`closedAt`** de la liquidación (no solo solape del rango operativo del turno). Por defecto: **hoy → fin de mes** (`billing-date-range.ts`, compartido con Facturación).

---

## Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Implementado** | Comportamiento alineado con operativa actual |
| **Parcial** | Existe; falta validación negocio o detalle menor |
| **Pendiente** | No implementado |
| **Pregunta** | Aclaración pendiente con negocio |

---

## Cabecera de página (shell)

| # | Elemento | Implementación | Estado | Código / notas |
|---|----------|----------------|--------|----------------|
| 1 | Título «Turnos cerrados» | ShellPage | **Implementado** | `turnos-cerrados/page.tsx` |
| 2 | Subtítulo con rango | `Historial de liquidaciones · dd/mm – dd/mm` | **Implementado** | `resolveBillingDateRange` |
| 3 | Export ZIP PDFs | `turnos-cerrados-pdfs.zip?from=&to=` | **Implementado** | Respeta rango URL |
| 4 | Export CSV viajes | `/api/tenant/export/viajes.csv` | **Implementado** | Global viajes, no solo cerrados del rango |

---

## Filtros y controles

| # | Campo | Implementación | Estado | Código / notas |
|---|-------|----------------|--------|----------------|
| 5 | Buscar conductor | `matchesSearchQuery` sobre nombre | **Implementado** | |
| 6 | Plataforma | Desplegable dinámico Uber / FreeNow / Bolt / Cabify | **Implementado** | `collectPlatformFiltersFromRows` |
| 7 | Atajos Hoy / Ayer / 7d / 30d | Navegan `?from=&to=` y recargan lista | **Implementado** | `setQuickRange` |
| 8 | Desde / Hasta + Aplicar | Sincroniza `?from=&to=` y recarga servidor | **Implementado** | `billingRangeQueryFromEs` |
| 9 | Mes rápido | Últimos 12 meses → URL | **Implementado** | `billingMonthQuickOptions` |
| 10 | Limpiar filtros | Restaura rango URL + quita búsqueda/plataforma | **Implementado** | |
| 11 | Contador «N turnos cerrados» | Filas tras filtros cliente | **Implementado** | |

---

## Tabla principal

Mismas columnas métricas que Cerrar turnos (sin avisos ni punto activo/inactivo).

| # | Campo | Implementación | Estado | Código / notas |
|---|-------|----------------|--------|----------------|
| 12 | PLATAFORMAS (iconos) | `ShiftPlatformDots` según slugs | **Implementado** | Bolt/Cabify si hay datos |
| 13 | CONDUCTOR + rango | Nombre + `formatDateTimeRange` del periodo liquidado | **Implementado** | |
| 14 | VIAJES … PEAJES | Agregación `shift-trip-aggregation` | **Implementado** | T3, primas, buckets pago |
| 15 | Ver detalle | Panel `ShiftRowDetailPanel` variant cerrado | **Implementado** | `shift-row-detail-panel.tsx` |
| 16 | Revertir cierre | Solo Super Admin impersonating | **Implementado** | `SuperAdminRevertCloseButton` |

---

## Exportaciones

| # | Export | Implementación | Estado | Código / notas |
|---|--------|----------------|--------|----------------|
| 17 | Excel turnos cerrados | Filtro plataforma + `from`/`to` en query | **Implementado** | `shiftExportXlsxHref`, `buildTurnosCerradosXlsx` |
| 18 | Metadatos Excel (empresa, fechas) | Filas Desde/Hasta/Empresa/Plataforma/Vista antes de la tabla | **Implementado** | `shift-exports.ts`, `export-company-scope-label.ts` |
| 19 | ZIP PDFs por liquidación | Máx. 80 grupos en periodo | **Implementado** | `closed-shifts-export.ts` |

---

## Integraciones

| # | Flujo | Implementación | Estado |
|---|-------|----------------|--------|
| 20 | Tras cerrar en Cerrar turnos | Viajes `closed`; fila en historial | **Implementado** |
| 21 | Desde ficha conductor | Tab → `/turnos-cerrados?shift=` abre detalle | **Implementado** | `driver-turnos-cerrados-tab.tsx` |
| 22 | Scope empresa (shell) | `driverWhere(scope)` en eventos y viajes | **Implementado** |

---

## Resumen de gaps (priorizado)

| Prioridad | Gap | Esfuerzo |
|-----------|-----|----------|
| ~~P0~~ | ~~Rango URL + filtro servidor por `closedAt`~~ | Hecho |
| ~~P1~~ | ~~Mes rápido + mensaje vacío con demo query~~ | Hecho |
| ~~P1~~ | ~~Atajos Hoy/7d/30d con URL~~ | Hecho |
| ~~P2~~ | ~~Excel: filas metadatos (empresa, fechas, plataforma)~~ | Hecho |
| **P2** | Spec negocio columna a columna (Excel cliente) | Medio — producto |
| **P3** | Filtrar por solape de periodo operativo vs solo `closedAt` | Pregunta negocio |

---

## Preguntas abiertas para negocio

1. ¿El rango de fechas debe usar **fecha de liquidación en caja** (`closedAt`) o **fechas de los viajes** del turno?
2. ¿Una liquidación multi-día aparece una fila o una por día natural?
3. ¿Export PDF debe incluir desglose por plataforma como en pantalla?

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Plantilla inicial + modelo `shift_liquidations` |
| 2026-05 | Operativo v1: URL fechas, filtro servidor, mes rápido, matriz implementación |
