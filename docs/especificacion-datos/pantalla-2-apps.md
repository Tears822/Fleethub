# Pantalla 2 — Uso de la App

**UI:** `/apps`  
**Título:** Actividad de conductores por plataforma · Hoy  
**Código:** `apps-usage-mock-view.tsx`, `apps-usage.queries.ts`, `apps-usage-export.ts`, `configuracion` (umbrales)

**Spec negocio:** recibida (cliente, Pantalla 2 de 5).

---

## Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Implementado** | Comportamiento alineado con la spec cumplimentada |
| **Parcial** | Existe en UI/código pero no coincide del todo con negocio |
| **Pendiente** | No implementado o bloqueado (API / modelo) |
| **Pregunta** | Contradicción o aclaración pendiente en negocio |

---

## Tabs y filtros

| # | Campo visible | Objetivo (negocio) | Implementación actual | Estado | Código / notas |
|---|---------------|-------------------|------------------------|--------|----------------|
| 1 | Tabs de plataforma (multiplataforma, ej. Zolty) | Sí, deben poder existir **más** plataformas además de Uber/FreeNow | Tabs dinámicos: **Todas** + una pestaña por cada `RidePlatform` con viajes hoy (`UBER`, `FREENOW`, `BOLT`, `CABIFY`, …) | **Implementado** | `apps-platform.ts`, `listAppsUsageToday` |
| 2 | Período por defecto | Siempre **Hoy** | Solo día actual (UTC 00:00–ahora). Sin selector de fechas | **Implementado** | `startOfTodayUtc()` en `apps-usage.queries.ts` |
| 3 | Contador de conductores | Conductores **con viajes** en el período | `N` filas tras filtros; subtítulo «conductores / filas · Hoy» | **Implementado** | Solo conductores con al menos un viaje en el bucket |
| 4 | Buscar conductor | Por **nombre** y por **empresa** | Búsqueda por `conductor` y `empresa` (razón social); scope global sigue en shell | **Implementado** | Placeholder «Buscar conductor o empresa…» |
| 5 | Todos los niveles | Filtrar por Óptimo / Medio / Bajo | Desplegable implementado | **Implementado** | `levelFilter` en `apps-usage-mock-view.tsx` |
| 6 | Exportar Excel | Exportar **tabla filtrada** (pestaña + búsqueda + nivel) | Exporta `filteredRows` del tab activo (incl. «Todas» unificado) | **Implementado** | `exportAppsUsageToExcel` |

---

## Umbrales de productividad

**Texto cliente (filas 7–8):** «los umbrales tienen que salir de las **medias del total del día**» (Óptimo > 85 % en €/h y aceptación).

**Texto cliente (filas 9–13):** umbrales fijos tipo ≥ 12 €/h, ≥ 85 %, Medio ≥ 10 / ≥ 70 %, Bajo < 10 y < 85 %, **configurables en Configuración**.

| # | Regla negocio (cliente) | Implementación actual | Estado | Notas |
|---|-------------------------|------------------------|--------|-------|
| 7 | ÓPTIMO — €/h (medias del día > 85 %) | Modo **medias del día** (opcional): €/h ≥ media flota hoy; si no, umbral fijo `eurPerHourMin` (12) | **Parcial** | Checkbox «Medias del día» en Configuración; `apps-productivity.ts` |
| 8 | ÓPTIMO — aceptación (media del día, mín. > 85 %) | Modo medias: aceptación ≥ media flota; si no, `acceptanceRateMin` (85) | **Parcial** | Aceptación sigue siendo **estimada** hasta API |
| 9 | ÓPTIMO — **ambas** condiciones a la vez | `eurOk && accOk` → «Óptimo» | **Implementado** | `productivityLevel()` |
| 10 | MEDIO — €/h ≥ 10 | Medio si `eurH >= eurPerHourMin - 2` (con defecto 12 → **10**) | **Implementado** | Derivado del umbral configurado, no literal 10 fijo |
| 11 | MEDIO — aceptación ≥ 70 % | Medio si `aceptacion >= acceptanceRateMin - 15` (85 → **70**) | **Implementado** | Idem |
| 12 | MEDIO — basta **una** de las dos | `eurH >= eurMedio \|\| aceptacion >= accMedio` | **Implementado** | OR en código |
| 13 | BAJO — < 10 €/h y aceptación < 85 % | Si no Óptimo ni Medio → «Bajo umbral» | **Parcial** | Equivalente con umbrales configurables, no literales fijos |
| 14 | Umbrales configurables (Configuración) | Umbrales fijos + opción **Medias del día de la flota**; leyenda dinámica en `/apps` | **Implementado** | `apps-usage-productivity-legend.ts`, `useFleetDayAverages` en tenant settings |

### Modos de productividad (implementados)

- **Por defecto:** umbrales fijos del tenant (12 / 85 y bandas Medio −2 / −15).
- **Opcional:** `useFleetDayAverages` — Óptimo si €/h y aceptación ≥ media del día; Medio si ≥ 85 % de la media en una métrica; Bajo si ambas &lt; 85 %.

Negocio puede elegir modo en Configuración sin cambiar código.

---

## Columnas de la tabla

| # | Campo | Objetivo (negocio) | Implementación actual | Estado | Código / notas |
|---|-------|-------------------|------------------------|--------|----------------|
| 15 | Conductor | Nombre completo | `driver.fullName` | **Implementado** | |
| 16 | Punto de color | Verde = activo pendiente cierre; Rojo = inactivo pendiente cierre (**API**) | Verde / ámbar / rojo = **productividad**; `title`/`aria-label` explícitos; nota bajo leyenda | **Parcial** | No API conexión; copy honesto en UI |
| 17 | Viajes | Completados en período y plataforma del tab | `count` de viajes en bucket conductor+plataforma, hoy | **Implementado** | Incluye pending + closed en agregación |
| 18 | Facturación | **Bruto** | Suma `grossAmountCents` (fallback neto) | **Implementado** | `bucketGrossCents` en `apps-usage.queries.ts` |
| 19 | Horas | **Horas conectado** a la app | `driver_platform_day_metrics` (sync plataforma) o duración viajes; refresh al abrir `/apps` | **Parcial** | `horasSource` platform/trips/estimated |
| 20 | €/hora | Facturación **bruta** ÷ horas | Bruto ÷ horas de viaje | **Implementado** | `formatEurH(grossCents, hoursMs)` |
| 21 | T. aceptación | Aceptados ÷ ofrecidos × 100 | Métricas día tras sync (Uber/FreeNow); si no, «(est.)» en UI | **Parcial** | `aceptacionSource` platform vs estimated |
| 22 | Productividad | Según umbrales 7–13 | `classifyProductivity` + medias flota opcionales | **Implementado** | Depende de umbrales configurables |

---

## Resumen de gaps (priorizado)

| Prioridad | Cambio | Esfuerzo |
|-----------|--------|----------|
| ~~P0~~ | ~~Umbrales fijos vs medias del día~~ | Ambos modos en Configuración |
| ~~P1~~ | ~~Facturación + €/h en **bruto**~~ | Hecho |
| ~~P1~~ | ~~Export servidor alineado con productividad Apps (fijo / medias del día)~~ | Hecho — `apps-export.ts` + `@fleethub/auth/apps-productivity` |
| ~~P1~~ | ~~Leyenda de productividad = **Configuración**~~ | Hecho |
| ~~P2~~ | ~~Plataformas extra en tabs~~ | Hecho (enum BD; Zolty cuando exista en `RidePlatform`) |
| ~~P2~~ | ~~Buscador por **empresa**~~ | Hecho |
| ~~P3~~ | ~~Horas/aceptación desde `driver_platform_day_metrics`~~ | Hecho — refresh página + worker 15 min + webhook; aceptación real tras sync Uber |
| ~~P3~~ | ~~Punto de color = estado conexión~~ | **Implementado** — Apps + listado Conductores + ficha conductor |

---

## Backlog ya entregado en código

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Tabs multi-plataforma dinámicos; búsqueda conductor + empresa |
| 2026-05 | Bruto en facturación/€/h; leyenda umbrales desde Configuración |
| 2026-05 | Pestaña **Todas las plataformas** + Excel unificado |
| 2026-05 | Refresh métricas día: `/apps`, worker, webhook; Excel servidor alineado; botón «Actualizar métricas» |
| 2026-03 | Pantalla operativa con Uber/FreeNow, filtros, umbrales tenant |

---

## Integraciones (referencia cruzada)

La pantalla **Apps** consume viajes y métricas del día; la ingesta live (poll + webhooks) y la monitorización por tenant están en **Configuración → Integraciones** y en Super Admin → Monitorización sync. Ver [MONITORIZACION-INGESTA.md](../MONITORIZACION-INGESTA.md).

| Área | Ruta | Notas |
|------|------|-------|
| Sync manual / historial | `/configuracion` | `ingest_source` en historial; KPIs y gráficas 24 h / 7 d |
| Cobertura 24 h | `/configuracion` | Conductores con viaje en 24 h vs vinculados |
| Super Admin global | `/super-admin/sync` | Cola BullMQ + agregados por hora |

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-05 | Enlace a monitorización ingesta (Configuración / Super Admin) |
| 2026-05 | Spec cliente Pantalla 2 incorporada; matriz vs `apps-usage.queries.ts` |
