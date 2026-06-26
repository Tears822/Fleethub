# Pantalla 5 — Analítica (Excel negocio · pantalla 5 de 5)

**UI:** `/analitica`  
**Título:** Comparativa sectorial · conductores de la empresa vs media del sector  
**Código:** `analitica-mock-view.tsx`, `analytics.queries.ts`, `analytics-sector.queries.ts`, `analytics-kpi.ts`

**Spec negocio:** ✅ Recibida y cumplimentada por cliente (2026-05).

**Estado global (2026-05):** **Operativo v1** — Spec cumplimentada implementada (KPIs, tabla dos filas con etiqueta «Media sector», opt-in, plataformas, export).

> **Numeración:** En el Excel de 5 pantallas, **Pantalla 5 = Analítica**. La ficha de conductores (`/conductores`) es otro módulo FRD — ver [pantalla-conductores.md](./pantalla-5-conductores.md) (nombre histórico `pantalla-5-conductores`).

---

## Leyenda

| Estado | Significado |
|--------|-------------|
| **Implementado** | Alineado con la spec cumplimentada |
| **Parcial** | Existe pero no coincide del todo |
| **Pendiente** | No implementado |
| **Pregunta** | Aclarar con negocio |

---

## Origen sector (crítico — confirmado por cliente)

| # | Pregunta | Respuesta negocio | Implementación | Estado |
|---|----------|-------------------|----------------|--------|
| 16 | ¿De dónde sale la media del sector? | Datos globales de empresas que **autorizan** mostrarlos para cálculo y referencia | `settings.analytics.sectorBenchmarkOptIn`; benchmarks solo de tenants opt-in; el viewer debe opt-in para ver | **Implementado** | Configuración → Analítica sectorial |
| 20 | ¿Nombre empresa en subtítulo (ej. BADAVI SL)? | Sí, de configuración | `resolveCompanyScopeLabel` en descripción página y subtítulo panel | **Implementado** | Selector shell (empresa o «Todas las empresas») |

### Fórmulas sector en código (referencia dev)

| Métrica | KPI superior (tarjeta) | Fila gris tabla (por conductor) |
|---------|------------------------|----------------------------------|
| Facturación, comisiones, neto, €/hora | Media de **totales por tenant** (excl. tenant actual), luego media entre tenants | Media de **métricas por conductor** en otros tenants (mismo periodo y filtro plataforma) |
| Viajes, turnos, propinas, primas, media/turno | — | Media por conductor en sector (`driverAveragesFromTrips`) |

Archivo: `apps/web/src/features/analytics/server/analytics-sector.queries.ts`.

---

## Filtros y controles

| # | Campo | Fórmula / origen (negocio) | Implementación | Estado | Código |
|---|-------|---------------------------|----------------|--------|--------|
| 1 | Tabs Total / Uber / FreeNow / Bolt / Cabify | Filtran tabla **y** 4 KPIs | `platformFilter` + `?platform=` en URL (refresh servidor) | **Implementado** | `analytics-platform.ts` |
| 2 | Período rápido: Hoy, Ayer, 30d, Mes actual, Mes anterior, **Semana anterior** | Incluir semana anterior | Preset `semanaAnterior` (lun–dom anterior) | **Implementado** | `analitica-mock-data.ts` |
| 3 | Fechas inicio/fin + combinar con rápidos | Sí | Presets rellenan fechas; rango manual en inputs | **Implementado** | |
| 4 | Botón **Aplicar** | Rango manual solo al pulsar | Con datos live: `navigateRange` → `?from=&to=`; presets aplican al instante | **Implementado** | `analitica/page.tsx` |
| 5 | Subtítulo período | Se actualiza al cambiar filtro | `periodLabel` + descripción página con `dateFromEs – dateToEs` | **Implementado** | |
| 6 | **↓ Excel** | Tabla con filtros aplicados | API `analitica.xlsx?from&to&platform`; columnas alineadas con tabla UI | **Implementado** | `analytics-export.ts`, `AnaliticaPageActions` |

---

## KPIs superiores (4 tarjetas)

Base datos empresa: viajes `trips` con `liquidationStatus = closed`, `startedAt` en rango, scope **empresa shell** (`driverWhere`).

| # | Campo | Fórmula / origen (negocio) | Implementación | Estado | Notas |
|---|-------|---------------------------|----------------|--------|-------|
| 7 | Facturación total | SUM bruto todos los conductores (periodo + filtros) | `sumRows(filteredRows).facturacion` ← `grossAmountCents` | **Implementado** | Scope = empresas del shell, no “todas las empresas del tenant” si hay filtro |
| 8 | vs sector facturación | Promedio acumulado bruto sector | `buildAnalyticsKpis`: % vs `sector.facturacion` (media por tenant ajeno) | **Implementado** | |
| 9 | Comisiones totales | SUM comisiones (filtros) | SUM `platformFeeCents` (negativo en UI) | **Implementado** | |
| 10 | vs sector comisiones | Promedio sector | Idem KPI | **Implementado** | |
| 11 | €/hora media | Media €/hora conductores (bruto ÷ horas) | **Global:** `facturacion / horas` (`sumRows`) | **Implementado** | |
| 12 | vs sector €/hora | Comparativa sector | Sector: bruto/horas en `metricsFromAgg` | **Implementado** | |
| 13 | Neto ingresado | Facturación + comisiones | `facturacion + comisiones` | **Implementado** | |
| 14 | vs sector neto | Comparativa | `buildAnalyticsKpis` | **Implementado** | |
| 15 | Color verde/rojo | Verde = por encima sector | `vsSectorPositive` en tarjetas | **Implementado** | Comisiones: “mejor” = menos comisión en valor absoluto |

---

## Tabla — conductores vs sector

**UX:** dos filas por conductor — fila superior datos reales, fila inferior gris con media sector (`MetricCells` + `rowSpan` en conductor/estado).

| # | Campo | Fórmula / origen (negocio) | Implementación | Estado |
|---|-------|---------------------------|----------------|--------|
| 21 | Conductor | Nombre + apellido | `driver.fullName` | **Implementado** |
| 22 | Fila superior | Datos reales periodo | Celdas principales | **Implementado** |
| 23 | Fila inferior gris | Media sector mismas métricas | Segunda `<tr>` gris por conductor (`variant="sector"`) | **Implementado** | Sin opt-in sector: una sola fila |
| 24 | Facturación conductor | SUM bruto | `grossAmountCents` | **Implementado** |
| 25 | Facturación sector | Media todas las sociedades | Media por conductor otros tenants | **Parcial** | Ver tabla sector arriba |
| 26 | Comisiones conductor | SUM comisiones | `-feeCents` | **Implementado** |
| 27 | Comisiones sector | Media sector | `driverSector.comisiones` | **Parcial** |
| 28 | Viajes | COUNT viajes | `agg.count` | **Implementado** |
| 29 | Viajes sector | Media sector | Δ en subfila | **Parcial** |
| 30 | Turnos | Turnos trabajados en periodo | Días distintos con viaje (`shiftDays.size`) | **Parcial** | No es entidad turno FRD |
| 31 | Turnos sector | Media sector | Δ subfila | **Parcial** |
| 32 | Media / turno | Facturación ÷ turnos | `facturacion / turnos` | **Implementado** |
| 33 | Media / turno sector | Media sector | Δ subfila | **Parcial** |
| 34 | €/hora | Facturación ÷ horas, **bruto** | `facturacion / horas` por conductor | **Implementado** |
| 35 | €/hora sector | Media sector | Δ subfila | **Parcial** |
| 36 | Propinas | SUM propinas | `tipCents` | **Implementado** |
| 37 | Propinas sector | Media sector | Δ subfila | **Parcial** |
| 38 | Primas | Del proveedor | SUM `platformBonusCents` | **Implementado** | `listAnalyticsByDriver` |
| 39 | Primas sector | Media sector | Media en `driverAveragesFromTrips` | **Implementado** | |
| — | **Estado** (icono) | — | ≥2 de 3 (facturación, viajes, €/h) vs media sector → ok | **Implementado** | No en Excel; añadido en producto |

---

## Fila «Total empresa»

| # | Campo | Fórmula / origen (negocio) | Implementación | Estado |
|---|-------|---------------------------|----------------|--------|
| 45 | Facturación total | SUM conductores | `tableTotals.facturacion` | **Implementado** |
| 46 | Facturación sector (gris) | Media global (conductores) | `driverSector.facturacion × n` en Δ (no media fleet sector) | **Parcial** | Validar fórmula con negocio |
| 47 | Comisiones total | SUM | OK | **Implementado** |
| 48 | Viajes total | SUM | OK | **Implementado** |
| 49 | Turnos total | SUM | OK | **Implementado** |
| 50 | Media / turno total | Facturación ÷ turnos | OK | **Implementado** |
| 51 | €/hora total | **Global** (no media simple) | `sumRows`: neto total / horas totales | **Implementado** | Coherente con código; distinto de media aritmética por conductor |
| 52 | Propinas total | SUM | OK | **Implementado** |
| 53 | Primas total | SUM | SUM `platformBonusCents` | **Implementado** |
| 54 | Estado fila total | Sin icono | Celda vacía | **Implementado** |

---

## Resumen de gaps (priorizado)

| Prioridad | Gap | Esfuerzo |
|-----------|-----|----------|
| ~~P0~~ | ~~Opt-in sector + filtrar benchmarks~~ | Hecho — Config + queries |
| ~~P1~~ | ~~€/hora bruto ÷ horas~~ | Hecho |
| ~~P1~~ | ~~Primas (`platformBonusCents`)~~ | Hecho |
| ~~P2~~ | ~~Preset semana anterior~~ | Hecho |
| ~~P2~~ | ~~Fila sector valores absolutos~~ | Hecho |
| ~~P2~~ | ~~Tabs Bolt / Cabify~~ | Hecho |
| ~~P3~~ | ~~Export XLSX con filtro plataforma~~ | Hecho |
| ~~P3~~ | ~~Subtítulo empresa activa~~ | Hecho |

---

## Demo

Rango con viajes cerrados tras seed:

`/analitica?from=2026-04-01&to=2026-05-31`

Con un solo tenant en BD, KPIs sector muestran *«sin otros operadores en el periodo»*.

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Spec cliente Pantalla 5 (Analítica) incorporada; matriz vs código |
| 2026-05 | Opt-in sectorial; €/h bruto; primas; preset semana anterior |
| 2026-05 | Media sector absoluta; Bolt/Cabify; export con plataforma; subtítulo empresa |
| 2026-05 | Tabla dos filas por conductor (empresa + media sector) |
| 2026-05 | Etiqueta «Media sector» + export Excel con fila sector |
