# Pantalla 1 — Dashboard · Resumen operativo del día

**Fuente negocio:** especificación cumplimentada por el cliente (Mar 2026).  
**UI:** `/dashboard` · `apps/web/src/app/(shell)/dashboard/page.tsx`  
**Cálculo KPIs:** `apps/web/src/features/dashboard/server/dashboard-operativa.queries.ts`  
**Alertas (panel inferior):** `apps/web/src/features/dashboard/server/dashboard-alerts.queries.ts`

---

## Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Objetivo** | Definición acordada con negocio (columna cliente) |
| **Implementado** | El código coincide con el objetivo |
| **Parcial** | Misma etiqueta en pantalla, regla de cálculo distinta |
| **Pendiente** | Aún no implementado |
| **Bloqueado** | Requiere modelo de turno o API live (Uber/FreeNow) |

---

## Glosario (negocio)

| Término | Definición según cliente |
|---------|---------------------------|
| **Turno** | Periodo de trabajo del conductor; **empieza** en un momento (puede **terminar otro día**). |
| **Turno abierto** | Conductor **aún trabajando** (turno no dado por cerrado operativamente). |
| **Turno pendiente de liquidar** | Conductor **ya terminó** el turno pero **no ha pasado por caja** / no liquidado. |
| **Viaje de app** | Servicios Uber + FreeNow (no captados en calle). |
| **Facturación bruta del día** | Importe bruto de los turnos del día (no neto después de comisiones). |

---

## Tarjetas KPI — fila superior

| # | Campo visible | Objetivo (negocio) | Implementación actual | Estado | Código / notas |
|---|---------------|-------------------|------------------------|--------|----------------|
| 1 | **Conductores activos hoy** (número) | Conductores que **trabajarán / trabajaron** en un turno cuyo **inicio es hoy** (el turno puede acabar otro día). | Unión: `shift_liquidations.periodFrom` hoy + conductores con viaje iniciado hoy. | **Parcial** | Proxy turno = `periodFrom` en liquidación + viajes del día |
| 2 | Subtexto «de N en plantilla» | Mismo universo; N = plantilla activa. | `de ${totalDrivers} en plantilla` — `drivers.isActive = true`. | **Implementado** | `tx.driver.count({ isActive: true })` |
| 3 | **Turnos activos ahora** (número) | Conductores con **turno abierto** (trabajando ahora). | Pendientes con viaje iniciado **después** del último `shift_liquidations` activo de hoy (o sin cierre hoy). | **Implementado** | `openShiftDriverIds` en `dashboard-operativa.queries.ts` |
| 4 | Subtexto «turnos en estado abierto» | Turnos abiertos. | «turno abierto · pendientes tras último cierre hoy». | **Implementado** | Distinto de «Turnos pendientes» (todos los pending) |
| 5 | **Facturación del día** (importe) | **Bruto** acumulado del día de los turnos. | Suma `grossAmountCents` (fallback `netAmountCents`) de viajes **cerrados** hoy. | **Implementado** | `tripGrossCents` + `dayGross` |
| 6 | Subtexto «importe bruto acumulado» | Bruto. | «importe bruto acumulado · cerrados hoy». | **Implementado** | Alineado con cálculo |
| 7 | **Viajes realizados** (número) | Número de viajes; subtexto **Uber + FreeNow** (app, no calle). | Viajes cerrados hoy con `platform IN (UBER, FREENOW)`. | **Implementado** | `todayClosedApp` |
| 8 | Subtexto «Uber + FreeNow» | Solo plataformas app. | «Uber + FreeNow · cerrados hoy». | **Implementado** | Copy |
| 9 | **Turnos pendientes** (naranja) | Turnos **finalizados** sin liquidar en caja. | `COUNT(DISTINCT driverId)` con viajes `pending` (sin filtro “hoy”). | **Implementado** | `groupBy driverId` — igual que Cerrar turnos |
| 10 | Subtexto «sin liquidar» | Sin pasar por caja. | «sin liquidar · igual que Cerrar turnos». | **Implementado** | |
| 11 | **Avisos** (rojo) | Número de **avisos** (comprobaciones varias). | Conteo de alertas accionables (`loadDashboardAlerts`, excl. `all-clear`). | **Implementado** | `applyActionableAlertCountToKpis` en `page.tsx` |
| 12 | Subtexto «requieren atención» | Varios tipos. | «N requieren atención» / «sin alertas activas». | **Implementado** | |

---

## Gráfico — Evolución de ingresos (últimos 14 días)

| # | Elemento | Objetivo (negocio) | Implementación actual | Estado | Código / notas |
|---|----------|-------------------|------------------------|--------|----------------|
| 13 | Eje Y (máximo) | Escala según datos del periodo. | Auto según máximo de serie (SVG). | **Implementado** | `dashboard-revenue-mock-chart.tsx` |
| 14 | Eje X (fechas) | Últimos 14 días naturales. | 14 puntos, etiqueta `dd/MM`. | **Implementado** | Bucle `i = 13..0` en operativa query |
| 15 | Valor por día | Ingresos del día (confirmar bruto vs neto con negocio). | **Bruto** diario, viajes **cerrados**, por `startedAt` del día. | **Implementado** | `byDay` + `tripGrossCents` |
| 16 | Título periodo (esquina) | Rango mostrado (ej. 15/04 – 28/04). | Subtítulo «Bruto diario (viajes cerrados)» + rango dinámico. | **Implementado** | `chartRangeLabel` + `DashboardRevenueMockChart` |

**Título pantalla / bloque:** «Evolución de ingresos — últimos 14 días».

---

## Widget — Top 5 conductores

| # | Elemento | Objetivo (negocio) | Implementación actual | Estado | Código / notas |
|---|----------|-------------------|------------------------|--------|----------------|
| 17 | Criterio ordenación | **Importe bruto** facturado en el día. | Orden por **bruto** (`grossAmountCents`, fallback neto) cerrados hoy. | **Implementado** | `topDriversToday` |
| 18 | Importe junto al nombre | **Bruto** (ej. 513 €). | Enteros en **euros brutos**. | **Implementado** | `topDriversToday` |
| 19 | Barra de progreso | Relativa al **máximo del día** (100 % el 1.º). | Relativa al conductor #1 del ranking. | **Implementado** | `dashboard-top-drivers-mock.tsx` |
| 20 | Etiqueta periodo («hoy») | Por defecto **hoy**; semanal / mensual. | Selector **Hoy / 7 días / Mes** (`?top=`) + subtítulo dinámico | **Implementado** | `dashboard-top-drivers-card.tsx` |

---

## Panel de alertas (debajo de KPIs)

No estaba en la plantilla Excel de 20 filas; en UI existe un **panel separado** con alertas reales:

| Alerta | Origen | Enlace |
|--------|--------|--------|
| Turnos pendientes de cierre | `pending` hoy | `/cerrar-turnos` |
| Productividad baja (mes) | Umbrales tenant | `/apps` |
| Sync obsoleta / fallida | `sync_runs` | `/configuracion` |

**Acción documentación:** la tarjeta KPI «Avisos» debería reflejar `alerts.length` (o conteo por severidad), no un 0/1 simplificado.

---

## Preguntas abiertas para negocio

1. **Facturación del día y Top 5:** ¿confirmáis **bruto** (`grossAmountCents`) en todos los casos?
2. **Conductores activos hoy:** ¿basta con «al menos un viaje con inicio hoy» hasta tener entidad turno?
3. **Turnos activos ahora:** ¿equivalencia temporal = conductores con viajes pending y último viaje &lt; X horas? ¿O solo con API «conectado»?
4. **Turnos pendientes:** ¿solo turnos que **empezaron hoy** o **cualquier** pending en Cerrar turnos?
5. **Viajes realizados:** ¿excluir Bolt/Cabify y viajes sin plataforma app?

---

## Backlog de implementación (priorizado)

| Prioridad | Cambio | Esfuerzo |
|-----------|--------|----------|
| ~~P0~~ | ~~Documentar en UI subtítulos honestos (neto vs bruto)~~ | Hecho |
| ~~P1~~ | ~~Facturación día + Top 5 en **bruto**; filtro Uber/FreeNow~~ | Hecho |
| ~~P1~~ | ~~Tarjeta **Avisos** = conteo de `loadDashboardAlerts`~~ | Hecho |
| ~~P2~~ | ~~**Turnos pendientes** alineado con Cerrar turnos (sin solo “hoy”)~~ | Hecho |
| ~~P2~~ | ~~Gráfico 14 días en bruto + etiqueta de rango fechas~~ | Hecho |
| ~~P3~~ | ~~Entidad **turno** + KPI conductores activos~~ | Parcial — `ShiftLiquidation.periodFrom` + viajes hoy |
| ~~P4~~ | ~~Top conductores: selector 7 días / mes~~ | Hecho |
| — | «Conectados ahora» vía API (FRD §5) | Bloqueado integración |

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Phase 7 P0–P2: bruto en KPI/gráfico/top 5, filtro Uber+FreeNow, avisos reales, pendientes = Cerrar turnos |
| 2026-05 | P4: Top 5 con periodo Hoy / 7 días / Mes (`?top=week|month`) |
| 2026-05 | Subtítulo shell con empresa activa (`resolveCompanyScopeLabel`) |
| 2026-03 | Spec cliente incorporada; matriz vs código `dashboard-operativa.queries.ts` |
