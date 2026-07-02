# FleetHub — Propuesta de integración con ERP de liquidaciones

**Documento para revisión del cliente**  
**Versión:** 1.0 · Julio 2026  
**Ámbito:** API de lectura JSON + autenticación por API Key para consumo desde ERP externo

---

## 1. Resumen ejecutivo

FleetHub **ya dispone** de los datos de plataformas (Uber, FreeNow, Bolt, Cabify) necesarios para alimentar vuestro ERP de liquidaciones: viajes, importes, desglose app/efectivo/tarjeta, propinas, peajes, primas, comisiones, conductor, empresa y plataforma.

Lo que **falta hoy** es exponer esos datos en una **API de lectura JSON** con **API Key**, para que el ERP los consuma de forma automática (botón «Actualizar plataformas» o sincronización programada).

**FleetHub no sustituye** vuestras liquidaciones internas ni la lógica de cierre en caja del ERP. Solo actúa como **fuente de verdad de datos de plataformas** ya normalizados y agregados.

| Concepto | Plazo orientativo |
|----------|-------------------|
| **MVP de integración** | 1–2 semanas desde acuerdo de requisitos |
| **Entregable principal** | API REST JSON + API Key + documentación OpenAPI |
| **Presupuesto** | A concretar en reunión (ver §10) |

---

## 2. Objetivo

Permitir que el ERP del cliente:

1. **Consulte** viajes y totales de facturación por periodo, conductor, día y plataforma.
2. **Importe** esos datos con un flujo tipo «Actualizar plataformas» o cron nocturno.
3. **Mantenga** en el ERP toda la lógica propia de liquidación, reparto conductor/empresa, IVA y cierre contable.

FleetHub seguirá siendo el sistema donde se **validan pagos**, se **cierran turnos en caja** y se **monitoriza la ingesta** desde Uber/FreeNow. El ERP recibe una **copia de lectura** de los datos ya consolidados.

---

## 3. División de responsabilidades

```mermaid
flowchart LR
  subgraph plataformas [Plataformas]
    Uber[Uber]
    FN[FreeNow]
  end

  subgraph fleethub [FleetHub]
    Ingesta[Ingesta y normalización]
    Validacion[Validación de pagos]
    Cierre[Cierre de turnos / Facturación]
    API[API lectura JSON]
  end

  subgraph erp [ERP del cliente]
    Import[Importar plataformas]
    Liquidacion[Liquidaciones internas]
    Contabilidad[Cierre contable]
  end

  Uber --> Ingesta
  FN --> Ingesta
  Ingesta --> Validacion --> Cierre --> API
  API -->|API Key| Import --> Liquidacion --> Contabilidad
```

| Responsabilidad | FleetHub | ERP cliente |
|-----------------|----------|-------------|
| Conectar con Uber / FreeNow | ✓ | — |
| Normalizar viajes y cobros | ✓ | — |
| Validar tipo de pago (app/efectivo/tarjeta) | ✓ | — |
| Cerrar turnos en caja (operativa flota) | ✓ | — |
| Pantalla Facturación y export Excel | ✓ | — |
| Reparto conductor / empresa (% neto, primas, comisión) | Configurable en FleetHub para cierre de turno | **Lógica principal en ERP** |
| Liquidaciones internas y nóminas | — | ✓ |
| Cierre contable / asientos | — | ✓ |
| Consumir datos vía API | Expone API | ✓ |

---

## 4. Qué datos tiene FleetHub hoy

### 4.1 Por viaje (`trips`)

Cada viaje ingresado desde plataforma incluye, como mínimo:

| Campo | Descripción | Uso ERP |
|-------|-------------|---------|
| `id` | Identificador interno FleetHub | Referencia cruzada |
| `externalTripId` | ID del viaje en la plataforma | Conciliación |
| `platform` | `UBER`, `FREENOW`, `BOLT`, `CABIFY` | Filtro / dimensión |
| `startedAt`, `endedAt` | Fecha/hora inicio y fin (Europe/Madrid) | Periodo contable |
| `fareType` | Tipo tarifa (incl. Tarifa 3 / precio cerrado) | Desglose T3 |
| `grossAmountCents` | Importe bruto | Facturación total |
| `platformFeeCents` | Comisión plataforma | Comisiones |
| `netAmountCents` | Neto tras comisión | Base liquidación |
| `tipCents` | Propinas | Desglose |
| `platformBonusCents` | Primas / incentivos plataforma | Desglose |
| `tollCents` | Peajes | Desglose |
| `paymentMethod` | app / cash / card / mixed | Clasificación |
| `appPaymentCents` | Importe cobrado vía app | Desglose cobro |
| `cashPaymentCents` | Importe en efectivo | Desglose cobro |
| `cardPaymentCents` | Importe TPV / tarjeta | Desglose cobro |
| `paymentValidated` | Pago confirmado por operador | Calidad del dato |
| `liquidationStatus` | `pending` \| `closed` | Alcance facturación |
| `driverId` | Conductor FleetHub | Dimensión conductor |
| `driver.fullName`, `driver.dni` | Nombre y DNI | Identificación ERP |
| `company.legalName`, `company.taxId` | Razón social y CIF | Dimensión empresa |

> **Importes:** almacenados en **céntimos** (`bigint`) para precisión; la API los serializará como string entero (`"4875"` = 48,75 €) o como decimal EUR según preferencia del cliente.

### 4.2 Agregados de facturación (pantalla Facturación)

Equivalente a lo que hoy veis en `/facturacion`:

| KPI / dimensión | Descripción |
|-----------------|-------------|
| Servicios | Número de viajes |
| Facturación total | Suma bruto |
| Comisión | Suma comisiones plataforma |
| Neto | Suma netos |
| App / Efectivo / Tarjeta | Suma por tipo de cobro |
| Tarifa 3 | Suma viajes precio cerrado |
| Propinas / Primas / Peajes | Sumas desglosadas |
| Por conductor | Una fila por conductor con métricas |
| Por día | Una fila por día natural (Madrid) |
| Global | Totales del periodo |
| Filtro plataforma | Todas / Uber / FreeNow / … |

**Regla de negocio v1:** la facturación incluye solo viajes **cerrados en caja** (`liquidationStatus = closed`) cuya **fecha de servicio** (`startedAt`) cae en el periodo seleccionado. Los viajes `pending` se informan aparte pero **no suman** a totales.

### 4.3 Liquidaciones de turno (`shift_liquidations`)

Cada cierre de turno en FleetHub genera un evento con:

| Campo | Descripción |
|-------|-------------|
| `id` | ID liquidación FleetHub |
| `closedAt` | Fecha/hora del cierre en caja |
| `periodFrom`, `periodTo` | Periodo operativo de los viajes incluidos |
| `tripIds` | Lista de viajes cerrados en ese evento |
| `platform` | Opcional: cierre solo Uber o solo FreeNow |
| `summary` | JSON con totales y reparto (bruto, neto, IVA, primas, comisión, fijo diario, % conductor, etc.) |

Útil si el ERP quiere replicar el **momento exacto del cierre en caja**, no solo el periodo de servicio.

### 4.4 Maestros auxiliares

| Entidad | Campos relevantes para ERP |
|---------|----------------------------|
| **Conductores** | `id`, `fullName`, `dni`, `companyId`, reparto económico (`driverSharePct`, `driverBonusSharePct`, `driverPlatformFeeSharePct`, `dailyFixedCents`) |
| **Empresas (razones sociales)** | `id`, `legalName`, `taxId`, perfil fiscal |
| **Cuentas plataforma** | `externalDriverId` por Uber/FreeNow (conciliación con portal) |

---

## 5. Situación actual: qué existe y qué falta

### 5.1 Lo que ya funciona (sin API externa)

| Canal | Formato | Autenticación | Limitación para ERP |
|-------|---------|---------------|---------------------|
| Pantalla **Facturación** | UI web + Excel en navegador | Sesión usuario | No automatizable |
| **Export Excel** turnos (`cerrar-turnos`, `turnos-cerrados`) | XLSX | Cookie sesión | Sin JSON; requiere login |
| **Export CSV** viajes | CSV básico | Cookie sesión | Columnas limitadas (sin primas, peajes, splits completos) |
| **Operativa** viajes detalle | JSON interno | Cookie sesión | Requiere `driverId` o `tripIds`; no pensado para M2M |

### 5.2 Brechas para integración ERP

| Brecha | Impacto |
|--------|---------|
| No hay API JSON pública de facturación | El ERP no puede consumir los mismos datos que la pantalla Facturación |
| No hay autenticación **API Key** / M2M | Sesión web no sirve para cron ni botón desatendido |
| CSV de viajes incompleto | Faltan campos financieros clave |
| Sin paginación estándar ni cursor | Importaciones grandes requieren troceo manual |
| Sin webhooks salientes (opcional) | El ERP debe hacer polling; no recibe push al cerrar turno |

**Conclusión técnica:** la propuesta encaja bien con FleetHub porque **los datos ya están**; el trabajo es **exponerlos** con contrato estable y auth adecuada.

---

## 6. Propuesta de integración — MVP

### 6.1 Principios de diseño

1. **Solo lectura** en MVP — el ERP no escribe en FleetHub.
2. **Paridad con Facturación** — mismos filtros, mismas reglas de periodo y estado `closed`.
3. **Multi-tenant seguro** — cada API Key ligada a un operador (`tenant`); opcional filtro por razón social (`companyId`).
4. **Versionado** — prefijo `/api/v1/integrations/…`.
5. **Documentación OpenAPI** — Swagger / Redoc para vuestro equipo técnico.
6. **Rate limiting** — protección razonable (p. ej. 60 req/min por key).

### 6.2 Autenticación

```
Authorization: Bearer fh_live_<api_key>
```

Opcional para operadores multi-empresa:

```
X-Company-Id: <uuid-razon-social>
```

| Aspecto | Detalle |
|---------|---------|
| Generación de key | Admin tenant en Configuración → Integraciones → ERP |
| Rotación | Revocar / regenerar desde UI |
| Alcance | Lectura de viajes, facturación y liquidaciones del tenant |
| Auditoría | Log de uso por key (IP, endpoint, timestamp) |

### 6.3 Endpoints propuestos (MVP)

#### A. Estado de la integración

```
GET /api/v1/integrations/health
```

Respuesta: tenant, timezone (`Europe/Madrid`), plataformas activas, última sync por plataforma.

---

#### B. Informe de facturación (equivalente pantalla Facturación)

```
GET /api/v1/integrations/billing/report
  ?from=2026-07-01
  &to=2026-07-31
  &platform=UBER|FREENOW|ALL
  &companyId=<uuid>
```

**Respuesta (resumen):**

```json
{
  "period": {
    "from": "2026-07-01",
    "to": "2026-07-31",
    "timezone": "Europe/Madrid"
  },
  "filters": {
    "platform": "ALL",
    "companyId": null,
    "liquidationStatus": "closed"
  },
  "kpis": {
    "tripCount": 842,
    "grossCents": "12540000",
    "feeCents": "1504800",
    "netCents": "11035200",
    "appCents": "9800000",
    "cashCents": "800000",
    "cardCents": "1940000",
    "t3Cents": "2100000",
    "tipCents": "45000",
    "bonusCents": "12000",
    "tollCents": "8000"
  },
  "byDriver": [
    {
      "driverId": "uuid",
      "driverName": "Nombre Apellido",
      "companyId": "uuid",
      "companyLegalName": "TAXIS GALERA, S.L.",
      "platforms": ["UBER", "FREENOW"],
      "metrics": { "...": "misma estructura que kpis" }
    }
  ],
  "byDay": [
    {
      "date": "2026-07-01",
      "metrics": { "...": "..." }
    }
  ],
  "pendingInPeriod": {
    "tripCount": 12,
    "driverCount": 3,
    "note": "Viajes en periodo aún sin cerrar en caja; no incluidos en totales"
  }
}
```

**Implementación interna:** reutiliza `listBillingReport` + `trip-metrics.ts` (misma lógica que la UI).

---

#### C. Libro de viajes (detalle para importación ERP)

```
GET /api/v1/integrations/trips
  ?from=2026-07-01
  &to=2026-07-31
  &liquidationStatus=closed|pending|all
  &platform=UBER
  &driverId=<uuid>
  &companyId=<uuid>
  &cursor=<opaque>
  &limit=500
```

**Respuesta por viaje:**

```json
{
  "data": [
    {
      "id": "uuid",
      "externalTripId": "HAZTIMRXGIYTINI",
      "platform": "FREENOW",
      "startedAt": "2026-07-01T05:45:00.000Z",
      "endedAt": "2026-07-01T06:12:00.000Z",
      "fareType": "STANDARD",
      "grossAmountCents": "4875",
      "platformFeeCents": "488",
      "netAmountCents": "4387",
      "tipCents": "0",
      "platformBonusCents": "0",
      "tollCents": "0",
      "paymentMethod": "app",
      "appPaymentCents": "4387",
      "cashPaymentCents": "0",
      "cardPaymentCents": "0",
      "paymentValidated": true,
      "liquidationStatus": "closed",
      "driver": {
        "id": "uuid",
        "fullName": "Nombre Apellido",
        "dni": "12345678A"
      },
      "company": {
        "id": "uuid",
        "legalName": "TAXIS GALERA, S.L.",
        "taxId": "B12345678"
      }
    }
  ],
  "pagination": {
    "nextCursor": "eyJ...",
    "hasMore": true
  }
}
```

---

#### D. Liquidaciones de turno (cierres en caja)

```
GET /api/v1/integrations/liquidations
  ?from=2026-07-01
  &to=2026-07-31
  &driverId=<uuid>
  &platform=UBER
  &cursor=<opaque>
  &limit=100
```

Filtra por **`closedAt`** (fecha del cierre en caja), coherente con pantalla Turnos cerrados.

**Respuesta:**

```json
{
  "data": [
    {
      "id": "uuid",
      "closedAt": "2026-07-02T08:30:00.000Z",
      "driverId": "uuid",
      "driverName": "Nombre Apellido",
      "companyLegalName": "TAXIS GALERA, S.L.",
      "periodFrom": "2026-07-01T04:00:00.000Z",
      "periodTo": "2026-07-02T04:00:00.000Z",
      "platform": "FREENOW",
      "tripCount": 8,
      "tripIds": ["uuid1", "uuid2"],
      "summary": {
        "grossCents": "45000",
        "netCents": "40500",
        "feeCents": "4500",
        "bonusCents": "0",
        "tipCents": "200",
        "tollCents": "0",
        "appPaymentCents": "38000",
        "cashPaymentCents": "2500",
        "cardPaymentCents": "0",
        "driverNetCents": "32000",
        "companyNetCents": "8500",
        "totalToSettleCents": "32000"
      }
    }
  ],
  "pagination": { "nextCursor": null, "hasMore": false }
}
```

---

#### E. Maestros (conductores y empresas)

```
GET /api/v1/integrations/drivers?active=true
GET /api/v1/integrations/companies
```

Para mapear IDs FleetHub ↔ códigos internos del ERP en la primera importación.

---

#### F. Export Excel server-side (opcional MVP+)

```
GET /api/v1/integrations/export/billing.xlsx?from=&to=&view=byDriver|byDay|global&platform=
```

Paridad con el Excel de Facturación, útil si el ERP prefiere fichero a JSON en una primera fase.

---

### 6.4 Flujos de uso en el ERP

#### Flujo 1 — «Actualizar plataformas» (manual)

1. Usuario pulsa botón en ERP.
2. ERP llama `GET /billing/report` + `GET /trips` para el periodo abierto.
3. ERP importa/actualiza tablas internas de servicios de plataforma.
4. Usuario continúa liquidación en ERP con vuestra lógica.

#### Flujo 2 — Sincronización automática (cron)

1. Cron nocturno (p. ej. 02:00 Europe/Madrid).
2. ERP consulta ayer + viajes `pending` recientes.
3. Import incremental por `externalTripId` + `platform` (idempotente).
4. Alerta si `pendingInPeriod.tripCount` > umbral (viajes sin cerrar en FleetHub).

#### Flujo 3 — Cierre por liquidación FleetHub (opcional fase 2)

1. ERP escucha webhook `liquidation.closed` **o** consulta `/liquidations` cada hora.
2. Importa el `summary` del cierre como asiento preliminar.
3. Ajustes contables finales en ERP.

---

## 7. Fases de proyecto

| Fase | Entregable | Plazo orientativo |
|------|------------|-------------------|
| **0. Alineación requisitos** | Checklist cerrado (§9), mapeo campos ERP | 2–3 días |
| **1. MVP API lectura** | Auth API Key + endpoints B, C, E + OpenAPI | 5–8 días |
| **2. Liquidaciones + paginación** | Endpoint D, cursor, rate limit, logs | 2–3 días |
| **3. UAT + ajustes** | Pruebas con ERP real, correcciones | 2–3 días |
| **4. (Opcional) Webhooks salientes** | Push al cerrar turno | 3–5 días adicionales |
| **4. (Opcional) Export XLSX server** | Endpoint F | 1–2 días adicionales |

**Total MVP (fases 0–3):** **1–2 semanas** desde acuerdo de requisitos y acceso a entorno de pruebas del ERP.

---

## 8. Fuera de alcance (MVP)

- Escritura en FleetHub desde ERP (crear conductores, cerrar turnos, validar pagos).
- Sustituir la pantalla de liquidación del ERP.
- Conexión directa ERP ↔ Uber/FreeNow (FleetHub sigue siendo el único conector de plataformas).
- Histórico anterior a los datos ya ingeridos en FleetHub (salvo backfill acordado aparte).
- SLA 24/7 dedicado (salvo contrato de soporte específico).

---

## 9. Requisitos a cerrar en reunión

Antes de desarrollo, conviene acordar:

| # | Tema | Opciones / pregunta |
|---|------|---------------------|
| 1 | **Granularidad de importación** | ¿Solo agregados (`/billing/report`) o también detalle viaje a viaje (`/trips`)? |
| 2 | **Criterio de fecha** | ¿Periodo por **fecha de servicio** (`startedAt`, como Facturación) o por **fecha de cierre** (`closedAt`, como Turnos cerrados)? ¿Ambos? |
| 3 | **Estado de viajes** | ¿Solo `closed` o también `pending` para previsión? |
| 4 | **Formato importes** | ¿Céntimos string (`"4875"`) o euros decimal (`48.75`)? |
| 5 | **Identificadores** | ¿Mapeo por DNI conductor, CIF empresa, `externalTripId`, o ID interno FleetHub? |
| 6 | **Multi-empresa** | ¿Una API Key por operador o una por razón social? |
| 7 | **Frecuencia sync** | Manual, diaria, horaria |
| 8 | **Entorno pruebas** | URL staging + tenant de prueba + API Key de sandbox |
| 9 | **Volumen** | Viajes/mes estimados (dimensiona paginación y rate limit) |
| 10 | **Fase 2** | ¿Interesa webhook al cerrar turno? |

---

## 10. Presupuesto y condiciones

> **Nota:** cifras orientativas para la reunión; presupuesto firmes tras checklist §9.

| Concepto | Descripción |
|----------|-------------|
| **MVP API integración** | Fases 0–3: API Key, billing report, trips, drivers/companies, OpenAPI, despliegue producción |
| **Opcional webhooks** | Notificación `liquidation.closed` al ERP |
| **Opcional export XLSX** | Descarga server-side equivalente a Facturación |
| **Mantenimiento** | Evolución de API (nuevos campos, plataformas) bajo acuerdo de soporte |

Condiciones habituales:

- Pago por hitos (50 % inicio / 50 % UAT aceptada) o según contrato marco.
- Cambios de alcance fuera del MVP → revisión de plazo y coste.
- El cliente facilita contacto técnico ERP para UAT (1–2 sesiones).

---

## 11. Seguridad y cumplimiento

| Medida | Detalle |
|--------|---------|
| HTTPS obligatorio | TLS 1.2+ en todos los entornos |
| API Key | Hash en base de datos; solo visible al crear |
| Aislamiento tenant | RLS PostgreSQL + validación en aplicación |
| Logs | Acceso API sin datos personales en claro en logs |
| Revocación | Inmediata desde panel admin |
| RGPD | FleetHub actúa como encargado del tratamiento respecto a datos de conductores importados de plataformas; DPA según contrato |

---

## 12. Referencias técnicas FleetHub

| Recurso | Ubicación |
|---------|-----------|
| Spec pantalla Facturación | `docs/especificacion-datos/pantalla-4-facturacion.md` |
| Spec turnos cerrados | `docs/especificacion-datos/pantalla-4-turnos-cerrados.md` |
| Agregación métricas | `apps/web/src/features/billing/server/trip-metrics.ts` |
| Queries facturación | `apps/web/src/features/billing/server/billing.queries.ts` |
| Liquidaciones | `packages/auth/src/shift-liquidation.ts` |
| Exports actuales | `apps/server/src/routes/tenant-export-routes.ts` |
| Modelo de datos | `packages/db/prisma/schema.prisma` |

---

## 13. Mensaje para el cliente (borrador)

> Gracias por la consulta sobre integración con vuestro ERP.
>
> Lo hemos revisado técnicamente: **la propuesta encaja bien con FleetHub**. Nosotros ya tenemos todos esos datos (viajes, desglose app/efectivo/tarjeta, propinas, peajes, por conductor y plataforma). Lo que falta es exponerlos en una **API de lectura JSON con API Key**, para que vuestro ERP los consuma con «Actualizar plataformas» o sync automático.
>
> **FleetHub no sustituye vuestras liquidaciones internas**; solo envía los datos de plataformas. Vosotros mantenéis la lógica de cierre en el ERP.
>
> Adjuntamos propuesta detallada (alcance, endpoints, plazos). El **MVP de integración** estaría en el orden de **1–2 semanas** desde acuerdo de requisitos. Quedamos a vuestra disposición para concretar presupuesto y checklist en reunión.

---

## 14. Historial del documento

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | Jul 2026 | Propuesta inicial MVP integración ERP |
