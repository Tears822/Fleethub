# Pantalla 4 — Facturación

**UI:** `/facturacion`  
**Título:** Panel de facturación de la flota · período seleccionable  
**Código:** `facturacion-mock-view.tsx`, `billing.queries.ts`, `billing-metrics-table.tsx`, `trip-metrics.ts`, `billing-date-range.ts`

**Spec negocio:** recibida (cliente, «Pantalla 4 de 5 — Facturación», cumplimentada Mar 2026).

**Estado global (2026-05):** Operativo v1 sobre viajes **cerrados**. Hecho: T3, primas, % en KPIs, fechas por defecto (hoy → fin de mes), mes rápido, Excel con metadatos (fechas, empresa, plataforma, vista) y números, KPIs superiores recalculados al filtrar plataforma, filtros dinámicos Uber / FreeNow / Bolt / Cabify según datos del periodo.

**Alcance de datos:** solo viajes **liquidados en caja** (`liquidationStatus = closed`) en el rango `startedAt`. Si existen viajes `pending` en el mismo periodo, la UI muestra un aviso con enlace a `/cerrar-turnos` (no suman a KPIs ni tabla).

> **Nota numeración docs:** en este repositorio, [pantalla-4-turnos-cerrados.md](./pantalla-4-turnos-cerrados.md) corresponde a `/turnos-cerrados` (operativa). La **Pantalla 4 del Excel de negocio** es esta facturación.

---

## Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Implementado** | Alineado con la spec cumplimentada |
| **Parcial** | Existe en UI pero no coincide del todo con negocio |
| **Pendiente** | No implementado o dato incorrecto |
| **Pregunta** | Aclaración pendiente con negocio |

---

## Conceptos de negocio (Tarifa 3 y Primas)

### Tarifa 3 (precio cerrado) — explicación cliente

Servicios con **tarifa de precio cerrado (T3)**: el taxímetro registra tiempo pero **no suma importe** en contador; la plataforma envía el **importe acordado** (calculador / precio cerrado). Ese importe debe **sumarse a la facturación del día** junto con los viajes de taxímetro que sí marcan importe.

**Identificación en datos:** `trips.fare_type` con T3 / precio cerrado (`isT3Fare` en `shift-liquidation.ts`). **Importe:** bruto del viaje (o neto si no hay bruto).

### Primas

**Incentivos** que la plataforma entrega al conductor por distintos motivos. En ingestión: `trips.platform_bonus_cents`. El cliente indica que el pago de primas es **siempre vía app** (no confundir con «descuento sobre pago app» en copy antiguo).

---

## Filtros y controles superiores

| # | Campo visible | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|---------------|------------------|------------------------|--------|----------------|
| 1 | Fecha inicio | Por defecto **día actual** | Sin query: **hoy** (inicio del día) | **Implementado** | `billing-date-range.ts` `todayStart()` |
| 2 | Fecha fin | Último día del mes actual (OK) | Sin query: **fin de mes actual** | **Implementado** | `endOfCurrentMonth()` |
| 3 | Selector de mes rápido | Muestra mes del rango (ej. Abril 2026) | Desplegable últimos 12 meses → navega con query | **Implementado** | `billingMonthQuickOptions` |
| 4 | Tabs Por conductor / Por día / Global | Cada tab muestra su dimensión | Tres tabs; tablas `byDriver`, `byDay`, `globalRows` | **Implementado** | `facturacion-mock-view.tsx` |
| 5 | Filtros plataforma Todas / Uber / FreeNow / Bolt / Cabify | Filtra tabla **y** KPIs | Píldoras dinámicas según viajes del periodo; tabla + KPIs + barra superior | **Implementado** | `billing-platform-filter.ts`, `platformSlugs` en filas |
| 6 | Buscar conductor | Filtra tabla; recarga con datos actualizados | Filtro **inline** en cliente; recarga solo al pulsar **Aplicar** fechas | **Parcial** | `matchesSearchQuery`; no refetch al buscar |
| 7 | Excel | Filtros aplicados; metadatos (fechas, plataforma, empresa, totales); **números** | Filas filtradas + Desde/Hasta/**Empresa**/Plataforma/Vista + fila TOTAL; celdas **numéricas** | **Implementado** | `billingCompanyScopeLabel`, `parseEuroCell` |

---

## KPIs superiores — barra «Resumen del periodo»

Agregación: `listBillingReport` → `totalAgg` sobre viajes **cerrados** en el rango.

| # | Campo | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|-------|------------------|------------------------|--------|----------------|
| 8 | SERVICIOS (número) | COUNT viajes del período | `totalAgg.count` | **Implementado** | Solo viajes `closed` |
| 9 | Subtexto «viajes totales» | Texto fijo | `hint: "viajes cerrados"` | **Implementado** | `buildPeriodKpis` |
| 10 | FACTURACIÓN TOTAL | SUM importe **bruto** | `totalAgg.grossCents` | **Implementado** | |
| 11 | Subtexto «N conductores» | COUNT DISTINCT conductores con actividad | `driverRows.length` en hint | **Implementado** | Conductores con ≥1 viaje cerrado |
| 12 | COMISIÓN (rojo) | SUM comisiones plataforma (negativo) | `-totalAgg.feeCents` formateado | **Implementado** | `platformFeeCents` |
| 13 | Subtexto % comisión | Cliente: **sin subtexto** (% variable por plataforma) | «comisiones de plataforma» | **Implementado** | Sin % fijo |
| 14 | NETO | Facturación total − comisión | `totalAgg.netCents` (suma netos por viaje) | **Implementado** | ≈ bruto − comisión |
| 15 | Subtexto «tras comisión» | Texto fijo | `hint: "tras comisiones"` | **Implementado** | |
| 16 | APP | SUM pagos app | `totalAgg.appCents` | **Implementado** | `paymentMethod` → bucket app |
| 17 | Subtexto % APP | APP ÷ facturación × 100 | `% del total` | **Implementado** | `pctOfGross` |
| 18 | EFECTIVO | SUM efectivo | `totalAgg.cashCents` | **Implementado** | |
| 19 | Subtexto % efectivo | % del total | `% del total` | **Implementado** | |
| 20 | TARJETA | SUM TPV / tarjeta | `totalAgg.cardCents` | **Implementado** | |
| 21 | Subtexto % tarjeta | % del total | `% del total` | **Implementado** | |
| 22 | TARIFA 3 | SUM bruto viajes T3 (precio cerrado) | `totalAgg.t3Cents` (`isT3Fare` + bruto) | **Implementado** | `trip-metrics.ts`, `fareType` en query |
| 23 | Subtexto % T3 | % del total | `% del total` | **Implementado** | |
| 24 | PROPINAS | SUM propinas | `totalAgg.tipCents` | **Implementado** | |
| 25 | Subtexto % propinas | % del total | `% del total` | **Implementado** | |
| 26 | PRIMAS | Incentivos plataforma | `totalAgg.bonusCents` | **Implementado** | `platformBonusCents` |
| 27 | Subtexto primas | Incentivos vía app | «incentivos plataforma · vía app» | **Implementado** | |
| 28 | PEAJES | SUM peajes reembolsables | `totalAgg.tollCents` | **Implementado** | |
| 29 | Subtexto «reembolsables» | Texto fijo | `hint: "reembolsables"` en KPI Peajes | **Implementado** | `buildPeriodKpis` |

---

## KPIs secundarios (fila bajo filtros de plataforma)

| # | Campo | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|-------|------------------|------------------------|--------|----------------|
| 30 | FACTURACIÓN TOTAL (abajo) | Filtrado por plataforma | `sumFromRows(filteredRows)` columna Factur. total | **Implementado** | `summaryKpi` |
| 31 | COMISIÓN (abajo) | Filtrado | Idem columna comisión | **Implementado** | |
| 32 | NETO (abajo) | Filtrado | Idem | **Implementado** | |
| 33 | SERVICIOS (abajo) | Filtrado | Idem | **Implementado** | |
| 34 | Propósito segunda fila | Ver totales **por plataforma** sin cambiar tab | Cuatro tarjetas recalculadas al filtrar Uber/FreeNow / búsqueda | **Implementado** | Complementa barra superior (periodo completo) |

---

## Tabla «Facturación por conductor» (y por día / global)

Mismas columnas en los tres tabs; fila = conductor, día o concepto global.

| # | Campo | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|-------|------------------|------------------------|--------|----------------|
| 35 | CONDUCTOR | Nombre + apellidos | `driver.fullName` | **Implementado** | |
| 36 | SERVICIOS | COUNT viajes conductor en período | `agg.count` | **Implementado** | |
| 37 | FACTUR. TOTAL | SUM bruto conductor | `agg.grossCents` | **Implementado** | |
| 38 | COMISIÓN | SUM comisiones (no % fijo 12 %) | `agg.feeCents` mostrado negativo | **Implementado** | |
| 39 | NETO | Factur. total − comisión | `agg.netCents` | **Implementado** | |
| 40 | APP | SUM pagos app | `agg.appCents` | **Implementado** | |
| 41 | EFECTIVO | SUM efectivo | `agg.cashCents` | **Implementado** | |
| 42 | TARJETA | SUM tarjeta TPV | `agg.cardCents` | **Implementado** | |
| 43 | TARIFA 3 | SUM T3 conductor | `agg.t3Cents` | **Implementado** | `aggToCells` índice 7 |
| 44 | PROPINAS | SUM propinas | `agg.tipCents` | **Implementado** | |
| 45 | PRIMAS | SUM primas | `agg.bonusCents` | **Implementado** | |
| 46 | PEAJES | SUM peajes | `agg.tollCents` | **Implementado** | |
| 47 | Fila TOTAL | SUM columnas; coherente con filtros | `<tfoot>` suma **filas visibles** filtradas | **Implementado** | Puede ≠ KPIs barra superior si hay filtro plataforma |

---

## Resumen de gaps (priorizado)

| Prioridad | Gap | Esfuerzo |
|-----------|-----|----------|
| ~~P0~~ | ~~Tarifa 3 y Primas en KPIs/tabla~~ | Hecho |
| ~~P1~~ | ~~Fechas por defecto y mes rápido~~ | Hecho |
| ~~P1~~ | ~~Excel numérico + metadatos (incl. empresa)~~ | Hecho |
| ~~P2~~ | ~~% del total y KPIs filtrados por plataforma~~ | Hecho |
| ~~P2~~ | ~~Filtros Bolt/Cabify dinámicos~~ | Hecho |
| ~~P2~~ | ~~Excel: empresa / scope en cabecera~~ | Hecho |
| ~~P3~~ | ~~Alcance pendientes vs cerrados~~ | **v1:** solo `closed` en totales; aviso + enlace si hay `pending` en el periodo |

---

## Lo que ya está bien para demo / operativa

- Rango de fechas por URL `?from=&to=` + Aplicar.
- Tres vistas (conductor, día, global con desglose por plataforma).
- KPIs y tabla desde BBDD real (viajes cerrados).
- Filtro de plataforma dinámico (Uber / FreeNow / Bolt / Cabify) + búsqueda + segunda fila de KPIs filtrados.
- Fila TOTAL en tabla según filtros activos.
- Scope empresa (selector shell) vía `driverWhere(scope)`.

---

## Preguntas abiertas para negocio

1. **Periodo por defecto:** ¿siempre mes natural actual (1 → último día) o día hoy → hoy para flotas que liquidan diario?
2. **Facturación con pendientes:** v1 = solo `closed` en KPIs/tabla; si hay pendientes en el periodo se muestra aviso con enlace a `/cerrar-turnos`. ¿Futuro: modo «incluir pendientes» en totales?
3. **Primas en %:** ¿el subtexto debe decir «incentivos plataforma» o mantener referencia a app?
4. **Excel:** ¿una hoja por tab o un libro con resumen + tres detalles?

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Spec cliente Pantalla 4 (Facturación) incorporada; matriz vs `/facturacion` |
| 2026-05 | P0–P2: T3, primas, fechas, mes rápido, % KPIs, Excel numérico, filtro en barra superior |
| 2026-05 | P2: filtros Bolt/Cabify dinámicos; empresa en export Excel |
| 2026-05 | P3: decisión v1 solo cerrados; `pendingInPeriod` informativo + enlace operativa |
| 2026-03 | Implementación inicial reporting cerrados + export Excel básico |
