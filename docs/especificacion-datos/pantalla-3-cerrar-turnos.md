# Pantalla 3 — Cerrar turnos

**UI:** `/cerrar-turnos`  
**Título:** Pendientes de cierre · liquidación en caja  
**Código:** `cerrar-turnos-mock-view.tsx`, `pending-shifts.queries.ts`, `shift-trip-aggregation.ts`, `tenant-shifts.ts`, `shift-row-detail-panel.tsx`

**Spec negocio:** recibida (cliente, Pantalla 3 de 5 — lista + detalle expandido).

**Estado global (2026-05):** **Operativo v1** para demo y cierre diario en caja. Matriz de campos mayormente **Implementado**; queda **Parcial** actividad turno en producción (API plataforma FRD §6) y `fareType` en ingestión live. Ver [gaps](#resumen-de-gaps-priorizado).

**Modelo actual:** no hay entidad `Shift`; un «turno pendiente» = conjunto de viajes `trips` con `liquidationStatus = pending` agrupados por **conductor** (y desglose por plataforma si aplica).

---

## Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Implementado** | Alineado con la spec cumplimentada |
| **Parcial** | Existe en UI pero no coincide del todo con negocio |
| **Pendiente** | No implementado o bloqueado (API / modelo) |
| **Pregunta** | Aclaración pendiente con negocio |

---

## Cabecera y filtros

| # | Campo visible | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|---------------|------------------|------------------------|--------|----------------|
| 1 | Subtítulo «N conductores con actividad pendiente…» | Contador dinámico | `filteredRows.length` (+ «de M» si hay filtros activos) | **Implementado** | `cerrar-turnos-mock-view.tsx` |
| 2 | Buscar conductor | Por nombre y apellido | Búsqueda sobre `conductor` (`driver.fullName`) | **Implementado** | `matchesSearchQuery` — no búsqueda por ID |
| 3 | Todas las plataformas | Todas las de la flota/conductor; total = suma; detalle por plataforma | Desplegable dinámico según plataformas con viajes (`UBER`, `FREENOW`, `BOLT`, `CABIFY`, …) | **Implementado** | `shift-platform.ts`, `shift-platform-filter.ts` |
| 4 | ● Activo / ● Inactivo | Activo = turno abierto ahora | Filtro por `turnoAbierto` (misma regla que dashboard: pendiente tras último cierre hoy) | **Implementado** | `lib/shift-open-status.ts`, `cerrar-turnos-mock-view.tsx` |
| 5 | Badge «X pendientes» | Mismo número que subtítulo (con filtros) | `filteredRows.length` en badge naranja | **Implementado** | Coincide con contador visible |

---

## Columnas de la tabla

| # | Campo | Origen (cliente) | Implementación actual | Estado | Código / notas |
|---|-------|------------------|------------------------|--------|----------------|
| 6 | PLATAFORMAS (iconos) | Solo plataformas con viajes en ese turno | `ShiftPlatformDots` + `platformSlugsFromRow` (Uber, FreeNow, Bolt, Cabify) | **Implementado** | `shift-platform.ts`, `shift-platform-dots.tsx`; demo: conductor Pau Ribas (Bolt+Cabify) |
| 7 | CONDUCTOR + fechas | Nombre + fecha(s) turno(s) pendiente(s) | `fullName` + `formatDateRange(min,max)`; «· TOTAL» si multi-plataforma | **Implementado** | `shift-trip-aggregation.ts` |
| 8 | ● Punto de color | Verde = turno **abierto**, rojo = **cerrado** | `turnoAbierto` calculado; alineado con filtro Activo/Inactivo | **Implementado** | `pending-shifts.queries.ts` |
| 9 | VIAJES | Total turno vs por plataforma | Fila TOTAL: suma todos; subfilas: solo esa plataforma | **Implementado** | `money.count` / `byPlatform` |
| 10 | IMPORTE TOTAL | Bruto antes de comisión | Suma `grossAmountCents` (fallback neto) | **Implementado** | `moneyToShiftColumns` → `total` |
| 11 | TARIFA 3 | Importe tarifa precio cerrado (T3), sumado al total aparte del taxímetro | Suma **bruto** de viajes con `fareType` T3 / precio cerrado (`isT3Fare`) | **Implementado** | `trip-metrics.ts`, `shift-liquidation.ts` |
| 12 | PAGO APP | Cobrado por la app | Neto vía app solo si `paymentValidated` (monto a liquidar) | **Implementado** | `collectiblePaymentsOnly` en agregación turnos |
| 13 | EFECTIVO | Monto a cobrar en efectivo (conductor) | Efectivo neto solo con pago confirmado; sin confirmar → aviso, no suma | **Implementado** | Idem + liquidación `shift-liquidation.ts` |
| 14 | TARJETAS | TPV taxi (no app) | Tarjeta neto solo con pago confirmado | **Implementado** | Clasificación app/efectivo/tarjeta corregida |
| 15 | PROPINAS | Plataforma y/o manual | Suma `tipCents` por viaje | **Implementado** | |
| 16 | PRIMAS | Las envía la plataforma con el servicio | Suma `platformBonusCents` por viaje | **Implementado** | Tabla + liquidación con reparto `driverBonusSharePct` (preview/PDF) |
| 17 | PEAJES | Reembolso al liquidar | Suma `tollCents` | **Implementado** | Lógica reembolso en liquidación: validar con negocio |
| 18 | AVISOS | Confirmación tipo de pago (Visa/efectivo/ambos) | Cuenta viajes con `paymentValidated = false`; confirmar en detalle → `POST /api/tenant/shifts/validate-payments` | **Implementado** | `paymentAlertCount`; `validate-trip-payments.ts` |

---

## Fila TOTAL y subfilas (multi-plataforma)

| # | Comportamiento | Cliente | Implementación | Estado |
|---|----------------|---------|----------------|--------|
| 19 | Fila TOTAL agrupa Uber + FreeNow | Correcto | `plataformas === "both"`, expand con desglose | **Implementado** |
| 20 | Subfila Uber | Correcto | `ShiftPlatformBreakdown` | **Implementado** |
| 21 | Subfila FreeNow | Correcto | Idem | **Implementado** |
| 22 | IMPORTE TOTAL = suma subfilas | Correcto | Agregación `money` vs `byPlatform` | **Implementado** |
| 23 | Cerrar por plataforma vs todas | Según filtro plataforma | Diálogo franja + `platform` en API; botón en cada subfila | **Implementado** | `shift-close-franja-dialog.tsx`, `closeTenantTrips` |

---

## Acciones

| # | Acción | Cliente | Implementación | Estado |
|---|--------|---------|----------------|--------|
| 24 | Ver detalle | Inline (aprobado) | Expande panel en la misma página | **Implementado** |
| 25 | Ocultar | Aprobado en su hito | Colapsa detalle (no archiva) | **Implementado** |
| 26 | Cerrar turnos | Siempre confirmación | Preview liquidación → `ShiftCloseConfirmDialog` | **Implementado** |
| 27 | Tras cerrar | Desaparece de lista → Turnos cerrados | Quita fila o refresca; viajes `closed`; ver `/turnos-cerrados` | **Implementado** |

**Extra (no en Excel):** selector **último viaje / franja horaria** antes del preview (`shift-close-franja-dialog.tsx`).

---

## Detalle expandido del turno

| # | Campo | Cliente | Implementación | Estado | Notas |
|---|-------|---------|----------------|--------|-------|
| 28 | Título bloque | Nombre — Detalle del turno · fecha | Formato equivalente en panel | **Implementado** | `shift-row-detail-panel.tsx` |
| 29 | Encabezado plataforma | «FreeNow · N viajes» por bloque | Sí, un bloque por plataforma con viajes | **Implementado** | Solo Uber/FreeNow en mapper |
| 30 | FECHA / HORA | Inicio viaje DD/MM/YYYY HH:MM | `formatDateTime(startedAt)` | **Implementado** | |
| 31 | TARIFA | Precio cerrado (T3), Taxímetro, … | `fareType` o default «Tarifa 3» | **Parcial** | Depende de ingestión `fare_type` |
| 32 | TIPO DE PAGO | APP / Efectivo / Tarjeta / mixto | Editable en detalle antes de confirmar; reparto efectivo+tarjeta | **Implementado** | `shift-trip-payment-editor.tsx`, `trip-payments` API |
| 33 | IMPORTE (viaje) | Bruto | `gross` o fallback `net` | **Implementado** | |
| 34 | TARIFA 3 (viaje) | Total importe con T3 | Bruto del viaje si `isT3Fare(fareType)`, si no `0` | **Implementado** | `shift-trip-detail-mapper.ts` |
| 35 | PAGO APP | = IMPORTE si pago APP | Sí cuando método App | **Implementado** | |
| 36 | EFECTIVO | 0 si APP | Sí | **Implementado** | |
| 37 | TARJETA | No simultáneo con APP | Mutuamente excluyente en mapper | **Implementado** | |
| 38 | COM. PLATAFORMA | Bruto × % (plataforma) | `-platformFeeCents` si existe | **Parcial** | % no siempre en BD |
| 39 | TOTAL (neto) | Bruto − comisión | `netAmountCents` | **Implementado** | |
| 40 | PROPINAS (viaje) | Por viaje + suma en total | Por viaje + fila total bloque | **Implementado** | |
| 41 | PRIMAS (viaje) | Prima por viaje (plataforma) | `platformBonusCents` por viaje + suma en total bloque | **Implementado** | `shift-trip-detail-mapper.ts`; worker stub en conectores |
| 42 | PEAJES (viaje) | Por viaje + suma | Por viaje + total | **Implementado** | |
| 43 | Fila «Total {plataforma}» | SUM columnas | `sumTripsFromApi` | **Implementado** | |

---

## Actividad del turno (sidebar)

| # | Campo | Cliente | Implementación | Estado |
|---|-------|---------|----------------|--------|
| 44 | Viajes realizados | COUNT viajes tabla | `trips.length` | **Implementado** |
| 45 | Horas conectado | **Tiempo activo** | `driver_platform_day_metrics` o backfill desde viajes al abrir detalle | **Parcial** | `resolveShiftActivity` + `backfillDriverPlatformDayMetricsFromTrips`; API live pendiente |
| 46 | €/hora | Sobre **bruto** | Bruto ÷ horas (métricas plataforma o estimadas) | **Parcial** | Misma fuente que fila 45 |
| 47 | No atendidos | Ofertas ignoradas (plataforma) | `missed_offers` agregado por día/plataforma; **0** si solo estimación | **Parcial** | Worker `syncDriverDayMetrics`; producción depende del conector |
| 48 | Rechazados | Aceptados luego rechazados | `rejected_trips` agregado; **0** si solo estimación | **Parcial** | Idem |
| 49 | ↓ Excel | Como está | Export cabecera + API `cerrar-turnos.xlsx` | **Implementado** |
| 50 | ↓ PDF | Mismo contenido que Excel | PDF liquidación en detalle / tras cerrar | **Implementado** | `shift-detail-pdf-export.ts`, `liquidation-pdf` |

---

## Resumen de gaps (priorizado)

| Prioridad | Gap | Esfuerzo |
|-----------|-----|----------|
| ~~P0~~ | ~~**Tarifa 3** en lista y detalle~~ | Hecho — `isT3Fare` + `t3Cents` |
| ~~P1~~ | ~~**Avisos** por `paymentValidated`~~ | Hecho |
| ~~P0~~ | ~~Filtro Activo/Inactivo vs punto de color~~ | Hecho — `computeTurnoAbiertoByDriver` |
| ~~P1~~ | ~~**Primas** en modelo y agregación~~ | Hecho — `platform_bonus_cents` |
| ~~P2~~ | ~~Filtro y desglose multi-plataforma~~ | Hecho |
| **P2** | Actividad API plataforma real (`syncDriverDayMetrics` live) | Alto — Uber/FreeNow API |
| ~~P2~~ | ~~Backfill métricas desde viajes + Bolt/Cabify en worker~~ | Hecho — sin API aún |
| ~~P3~~ | ~~Efectivo/tarjetas «monto a cobrar»~~ | Hecho — solo `paymentValidated`; cobrado en caja sigue en flujo de cierre |

---

## Lo que ya está bien para demo / operativa

- Listado de pendientes por conductor con agregación real desde BBDD.
- Multi-plataforma: fila TOTAL + subfilas + cierre por plataforma o todo.
- Confirmación de cierre, preview, PDF, persistencia `ShiftLiquidation` + audit.
- Detalle inline, Excel/PDF, búsqueda y filtros básicos.
- Tras cerrar: desaparece de pendientes y aparece en **Turnos cerrados** (`/turnos-cerrados`).

---

## Preguntas abiertas para negocio

1. **Turno abierto vs conductor activo:** ¿el punto de color debe reflejar estado del turno o del conductor en maestro de datos?
2. **T3:** ¿cómo identificamos un viaje T3 en datos (`fareType`, flag, importe en metadata)? ¿La columna T3 solo suma viajes T3 o también muestra 0 en taxímetro?
3. **Avisos:** ¿un aviso = un viaje con `paymentValidated` pendiente, o reglas más finas (efectivo + tarjeta en mismo viaje)?
4. **Primas:** ¿una prima por turno por plataforma o por conductor-global? ¿Campo separado en webhook?
5. **Viajes en filtro «Todas»:** ¿el contador de viajes en fila TOTAL incluye todas las plataformas aunque el filtro muestre solo Uber? (hoy el filtro de plataforma también filtra filas/conductores).

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Spec cliente Pantalla 3 incorporada; matriz vs código actual |
| 2026-05 | T3 por `fareType`; avisos por `paymentValidated`; punto verde = turno abierto |
| 2026-05 | Primas (`platform_bonus_cents`); filtros/iconos dinámicos Bolt/Cabify |
| 2026-05 | Actividad turno: `driver_platform_day_metrics`, API `activity`, seed demo, worker stub |
| 2026-05 | Filtro Activo/Inactivo = `turnoAbierto` (liquidación hoy vs viajes pendientes) |
| 2026-05 | Confirmación tipo de pago en detalle (avisos) |
| 2026-05 | Pago app/efectivo/tarjetas solo con tipo confirmado (`isCollectiblePaymentTrip`) |
| 2026-05 | Backfill métricas día desde viajes; conectores Bolt/Cabify en worker |
| 2026-05 | Sync manual en Configuración (`/api/tenant/sync/poll` + botones por plataforma) |
| 2026-05 | Iconos Bolt/Cabify en tabla y desglose; seed demo Pau Ribas (pendientes Bolt+Cabify) |
| 2026-03 | Core cierre: liquidación, franja, PDF, Excel, multi-plataforma Uber/FreeNow |
