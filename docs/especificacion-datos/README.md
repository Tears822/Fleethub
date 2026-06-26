# Especificación de datos — FleetHub (pantallas)

Documentación de **origen y fórmula** de cada campo visible en la UI, aportada por negocio y contrastada con la implementación actual.

| Pantalla (negocio) | Ruta | Documento | Spec negocio | Implementación |
|--------------------|------|-----------|--------------|----------------|
| **1 — Dashboard** | `/dashboard` | [pantalla-1-dashboard.md](./pantalla-1-dashboard.md) | ✅ Recibida (Mar 2026) | ⚠️ Parcial (proxy turno; KPIs P0–P2) |
| **2 — Uso de la App** | `/apps` | [pantalla-2-apps.md](./pantalla-2-apps.md) | ✅ Recibida (2026-05) | ⚠️ Parcial (conexión vía worker; aceptación API) |
| **3 — Cerrar turnos** | `/cerrar-turnos` | [pantalla-3-cerrar-turnos.md](./pantalla-3-cerrar-turnos.md) | ✅ Recibida (2026-05) | ✅ Operativo v1 — ver matriz |
| **4 — Facturación** | `/facturacion` | [pantalla-4-facturacion.md](./pantalla-4-facturacion.md) | ✅ Recibida (2026-05) | ✅ Operativo v1 — ver matriz |
| **4 — Turnos cerrados** *(operativa)* | `/turnos-cerrados` | [pantalla-4-turnos-cerrados.md](./pantalla-4-turnos-cerrados.md) | Matriz técnica (spec cliente pendiente) | ✅ Operativo v1 |
| **5 — Analítica** *(Excel 5/5)* | `/analitica` | [pantalla-5-analitica.md](./pantalla-5-analitica.md) | ✅ Recibida (2026-05) | ✅ Operativo v1 |
| **Conductores** *(FRD §8, no Excel 5)* | `/conductores` | [pantalla-5-conductores.md](./pantalla-5-conductores.md) | Matriz técnica | ✅ Operativo v1 |

> La numeración del **Excel de negocio (5 pantallas)** termina en **Analítica**. «Turnos cerrados» es operativa (`pantalla-4-turnos-cerrados.md`). «Conductores» no es la pantalla 5 del Excel (el archivo `pantalla-5-conductores.md` conserva nombre histórico).

## Cómo usar estos documentos

1. **Producto / cliente:** rellenar la columna «Fórmula / origen» en cada pantalla (como el Excel de Pantalla 1).
2. **Desarrollo:** antes de cambiar un KPI, actualizar la fila en el `.md` y el código referenciado (`Código` en la tabla).
3. **QA:** criterios de aceptación = filas con estado **Implementado**; marcar cuando coincidan con negocio.

## Documentos relacionados

- [FRD v1.2](../IMPLEMENTATION-CHECKLIST.md) — requisitos funcionales generales
- [IMPLEMENTATION-CHECKLIST.md](../IMPLEMENTATION-CHECKLIST.md) — inventario técnico
- [MONITORIZACION-INGESTA.md](../MONITORIZACION-INGESTA.md) — sync, webhooks, `ingestion_events`, UI monitorización
- [NEXT-STEPS-FRD.md](../NEXT-STEPS-FRD.md) — backlog por fases

## Concepto transversal: turno vs viaje

La especificación de negocio habla de **turno** (apertura, cierre operativo, liquidación en caja).

Hoy FleetHub persiste principalmente **viajes** (`trips`) con `liquidationStatus`:

| Estado negocio (aprox.) | Modelo actual |
|-------------------------|---------------|
| Turno abierto / conductor trabajando | No modelado como entidad |
| Turno terminado, pendiente de liquidar | Viajes `pending` del conductor |
| Turno liquidado en caja | Viajes `closed` |

Hasta exista entidad `shift` (o reglas firmes de equivalencia), los KPIs del Dashboard son **aproximaciones** documentadas en [pantalla-1-dashboard.md](./pantalla-1-dashboard.md).

**Facturación** agrega solo viajes **`closed`** en el período; **Cerrar turnos** trabaja sobre **`pending`**.
