# FleetHub × ERP — Propuesta de integración

**Para:** Cliente (operador de flota)  
**De:** FleetHub  
**Fecha:** Julio 2026  
**Versión:** 1.5

---

## 1. Introducción

Gracias por la consulta sobre la integración con vuestro ERP de liquidaciones.

Lo hemos revisado técnicamente y **la propuesta encaja bien con FleetHub**. Nosotros ya disponemos de todos los datos que necesitáis: viajes, desglose app/efectivo/tarjeta, propinas, peajes, primas, comisiones, por conductor, empresa y plataforma (Uber, FreeNow, etc.).

Lo que falta hoy es **exponer esos datos en una API de lectura JSON con API Key**, para que vuestro ERP los consuma con un botón «Actualizar plataformas» o mediante sincronización automática programada.

**FleetHub no sustituye vuestras liquidaciones internas.** Solo actúa como fuente de datos de plataformas ya normalizados. Vosotros mantenéis la lógica de cierre, reparto y contabilidad en el ERP.

| | |
|---|---|
| **Plazo MVP** | 1–2 semanas (10–14 días laborables) |
| **Presupuesto MVP** | **7.000 €** (IVA no incluido) |
| **Pago** | Por hitos — ver §6 y §7 |

---

## 2. Objetivo de la integración

| Objetivo | Descripción |
|----------|-------------|
| **Consultar** | Totales y detalle de viajes por periodo, conductor, día y plataforma |
| **Importar** | Flujo manual («Actualizar plataformas») o automático (cron nocturno) |
| **Conciliar** | Mismos criterios que la pantalla Facturación de FleetHub |
| **Liquidar en ERP** | Vuestra lógica de reparto, IVA y cierre contable sin cambios |

---

## 3. División de responsabilidades

| Área | FleetHub | Vuestro ERP |
|------|----------|-------------|
| Conexión con Uber / FreeNow | ✓ | — |
| Normalización de viajes y cobros | ✓ | — |
| Validación de pagos (app/efectivo/tarjeta) | ✓ | — |
| Cierre de turnos en caja (operativa flota) | ✓ | — |
| Pantalla Facturación y exportaciones | ✓ | — |
| **Liquidaciones internas y nóminas** | — | ✓ |
| **Cierre contable / asientos** | — | ✓ |
| **Consumo de datos vía API** | Expone API | ✓ |

---

## 4. Datos que FleetHub entregará al ERP

### 4.1 Por viaje

| Dato | Descripción |
|------|-------------|
| Identificadores | ID FleetHub, ID plataforma, plataforma (Uber/FreeNow/…) |
| Fechas | Inicio y fin del servicio (zona horaria Europe/Madrid) |
| Importes | Bruto, comisión plataforma, neto, propinas, primas, peajes |
| Cobro | App / efectivo / tarjeta (importe por canal) |
| Conductor | Nombre, DNI, empresa (razón social, CIF) |
| Estado | Cerrado en caja / pendiente, pago validado |
| Tarifa | Incluye Tarifa 3 (precio cerrado) |

### 4.2 Agregados de facturación

Equivalente a la pantalla **Facturación** de FleetHub:

- Servicios, facturación total, comisión, neto  
- App, efectivo, tarjeta, Tarifa 3, propinas, primas, peajes  
- Desglose **por conductor**, **por día** y **global**  
- Filtro por plataforma (Todas / Uber / FreeNow / …)

**Regla de negocio:** por defecto solo viajes **cerrados en caja** en el periodo (fecha de servicio). Los pendientes se informan aparte y no suman a totales.

### 4.3 Liquidaciones de turno (opcional en MVP)

Eventos de cierre en caja con totales consolidados y lista de viajes incluidos — útil si el ERP trabaja por **fecha de cierre** y no solo por fecha de servicio.

### 4.4 Maestros

Listado de conductores y empresas (razones sociales) para mapear IDs FleetHub ↔ códigos internos del ERP.

---

## 5. Solución propuesta — API de lectura

### 5.1 Características

- **Solo lectura** — el ERP consulta; no modifica FleetHub  
- **Autenticación API Key** — `Authorization: Bearer fh_live_…`  
- **Documentación OpenAPI** (Swagger) para vuestro equipo técnico  
- **HTTPS** obligatorio · aislamiento por operador · logs de acceso  
- **Paginación** para importaciones de alto volumen  

### 5.2 Endpoints principales (MVP)

| Endpoint | Uso en ERP |
|----------|------------|
| `GET …/billing/report` | Totales y desglose (como Facturación) |
| `GET …/trips` | Detalle viaje a viaje para importación |
| `GET …/liquidations` | Cierres de turno en caja |
| `GET …/drivers` · `GET …/companies` | Maestros para mapeo |
| `GET …/health` | Estado de la integración y última sync |

### 5.3 Flujos de uso

**Manual — «Actualizar plataformas»**  
El usuario pulsa el botón en el ERP → el ERP consulta FleetHub → importa/actualiza servicios del periodo.

**Automático — cron**  
Sincronización programada (p. ej. cada noche) → import incremental por ID de viaje en plataforma → alerta si hay viajes pendientes de cerrar en FleetHub.

---

## 6. Plan de proyecto, hitos y plazos

Calendario orientativo desde la **firma y checklist de requisitos cerrado** (ver §8).

### 6.1 Resumen — hitos, pasos y presupuesto

| Hito | Pasos clave | Duración | Semana | Importe | Pago |
|------|-------------|----------|--------|---------|------|
| **H0 — Kick-off** | Requisitos, mapeo ERP, sandbox | 2–3 días | S1 | Incluido | — |
| **H1 — API core** | API Key, facturación, viajes, maestros, OpenAPI | 5–8 días | S1–S2 | **2.800 €** | Firma / inicio dev |
| **H2 — Liquidaciones** | Cierres en caja, paginación, seguridad | 2–3 días | S2 | **2.100 €** | Sandbox funcional |
| **H3 — UAT y go-live** | Pruebas ERP, ajustes, producción | 2–3 días | S2 | **2.100 €** | UAT aceptada |
| | | **10–14 días** | **1–2 sem.** | **7.000 €** | |

**Plazo total MVP (H0–H3): 10–14 días laborables (1–2 semanas).**

### 6.2 Pasos detallados por hito

#### H0 — Kick-off (2–3 días) · Incluido

| Paso | Qué hacemos |
|------|-------------|
| H0.1 | Reunión de alineación y cierre del checklist de requisitos |
| H0.2 | Mapeo de campos entre FleetHub y vuestro ERP (DNI, CIF, IDs) |
| H0.3 | Entrega de entorno sandbox y API Key de prueba |
| H0.4 | Acta de requisitos acordada |

**Entregables:** acta de requisitos · sandbox · contacto técnico ERP.

---

#### H1 — API core (5–8 días) · 2.800 €

| Paso | Qué hacemos |
|------|-------------|
| H1.1 | Autenticación API Key (generación y revocación desde FleetHub) |
| H1.2 | Informe de facturación (`/billing/report`) — paridad con pantalla Facturación |
| H1.3 | Libro de viajes detallado (`/trips`) con paginación |
| H1.4 | Maestros de conductores y empresas (`/drivers`, `/companies`) |
| H1.5 | Estado de la integración (`/health`) |
| H1.6 | Documentación OpenAPI y ejemplos de importación |

**Entregables:** API operativa en sandbox · OpenAPI · guía de importación.

**Pago:** al inicio de desarrollo (firma de propuesta).

---

#### H2 — Liquidaciones y hardening (2–3 días) · 2.100 €

| Paso | Qué hacemos |
|------|-------------|
| H2.1 | Endpoint de liquidaciones de turno (`/liquidations`) |
| H2.2 | Paginación para importaciones de alto volumen |
| H2.3 | Rate limiting y registro de accesos por API Key |
| H2.4 | Demo en sandbox con datos de vuestra flota |

**Entregables:** sandbox completo · liquidaciones · paginación.

**Pago:** entrega sandbox funcional (fin H2).

---

#### H3 — UAT y go-live (2–3 días) · 2.100 €

| Paso | Qué hacemos |
|------|-------------|
| H3.1 | Pruebas conjuntas con vuestro ERP (import manual y automático) |
| H3.2 | Correcciones y ajustes según resultados UAT |
| H3.3 | Despliegue en producción y API Key live |
| H3.4 | Entrega de guía de integración para vuestro equipo |

**Entregables:** UAT firmada · API en producción · 30 días de garantía post go-live.

**Pago:** UAT aceptada y API en producción.

---

### 6.3 Opcionales (fuera del MVP)

| Módulo | Descripción | Plazo adicional | Importe |
|--------|-------------|-----------------|---------|
| **Webhooks** | Aviso al ERP cuando se cierra un turno en FleetHub | +3–5 días | **1.800 €** |
| **Export Excel server** | Descarga XLSX equivalente a Facturación | +1–2 días | **900 €** |
| **Mantenimiento mensual** | Soporte integral FleetHub + API ERP (ver §7.3) | Continuo | **2.000 €/mes** |

---

## 7. Presupuesto

Propuesta económica vinculada a los hitos del §6. Importes en **EUR**, **IVA no incluido** salvo indicación contraria.

### 7.1 MVP — Integración ERP (H0–H3)

| Hito | % | Importe | Condición de pago |
|------|---|---------|-------------------|
| H0 — Kick-off y requisitos | — | Incluido | — |
| H1 — API core | 40 % | **2.800 €** | Al inicio de desarrollo (firma) |
| H2 — Liquidaciones y hardening | 30 % | **2.100 €** | Entrega sandbox funcional |
| H3 — UAT y go-live | 30 % | **2.100 €** | UAT aceptada y API en producción |
| **Total MVP** | 100 % | **7.000 €** | |

*Incluye: desarrollo, despliegue, documentación OpenAPI, 2 sesiones de soporte UAT (remoto), 30 días de garantía corrección de defectos post go-live.*

### 7.1.1 Por qué el MVP API son 7.000 € (y FleetHub se construyó por ~2.000 €)

Es una pregunta habitual y legítima. **No es pagar 3,5× por “lo mismo”**: son **dos entregables distintos**, con alcance, riesgo y destinatario diferentes.

| | FleetHub inicial (~2.000 €) | API integración ERP (7.000 € MVP) |
|---|----------------------------|-----------------------------------|
| **Qué se construyó** | Producto operativo interno (pantallas para gestores) | **Capa nueva**: API pública de lectura para un sistema externo |
| **Usuario final** | Personas de la flota (login web) | **Máquinas** — vuestro ERP y su desarrollador |
| **Autenticación** | Sesión web ya existente | **API Key** nueva (generación, revocación, hash, auditoría) |
| **Interfaz** | UI Next.js reutilizando queries internas | **REST JSON versionado** + OpenAPI + ejemplos de import |
| **Contrato con terceros** | No aplica | Sí — compromiso de **no romper** el import del ERP en futuras versiones |
| **Pruebas** | Validación con el operador | **UAT conjunta** con el equipo que construye el ERP |
| **Alcance técnico** | Mostrar datos ya en BD | Exponer facturación, viajes, liquidaciones, maestros, paginación, filtros, rate limit |
| **Estado al empezar** | Greenfield / MVP acotado | FleetHub **maduro** en producción — la API reutiliza lógica compleja ya probada (Uber, FreeNow, primas, T3, multi-tenant) |

**En resumen:** los ~2.000 € de FleetHub cubrieron el **MVP operativo** (cerrar turnos, ver viajes, arrancar ingesta). Los **7.000 €** cubren **construir desde cero** el canal B2B hacia vuestro ERP — algo que **hoy no existe** en el producto.

#### Desglose de los 7.000 € (qué hay detrás del precio)

| Hito | Importe | Trabajo principal |
|------|---------|-------------------|
| **H1 — API core** | 2.800 € | API Key, `/billing/report`, `/trips`, `/drivers`, `/companies`, `/health`, OpenAPI, sandbox |
| **H2 — Liquidaciones** | 2.100 € | `/liquidations`, paginación cursor, rate limiting, logs de acceso, demo con datos reales |
| **H3 — UAT y go-live** | 2.100 € | Pruebas con vuestro ERP, correcciones, producción, guía integración, garantía 30 días |
| **Total** | **7.000 €** | ~10–14 días laborables · proyecto cerrado con entregables verificables |

Equivalente orientativo: **~80–100 horas** de ingeniería senior (backend, seguridad, documentación, coordinación ERP) a tarifa de proyecto de integración B2B — no de pantalla interna.

#### Qué incluye el MVP de 7.000 € y qué no

**Incluido:**

- Diseño e implementación de la API de lectura completa (MVP §5–§6)
- Documentación OpenAPI para vuestro desarrollador ERP
- Entorno sandbox + API Key de prueba
- 2 sesiones UAT remotas con el equipo ERP
- Despliegue en producción y API Key live
- 30 días garantía post go-live (defectos, no nuevas funcionalidades)

**No incluido** (presupuesto aparte):

- Desarrollo dentro del ERP del cliente
- Webhooks salientes, export XLSX server, mantenimiento mensual
- Cambios de alcance acordados tras UAT

#### Por qué no basta con “exportar lo que ya tiene FleetHub”

Hoy FleetHub **ya tiene** los datos, pero:

- La facturación se consume en **pantalla web** y Excel en navegador — no hay API JSON pública.
- Los exports actuales usan **cookie de sesión** — no sirven para cron ni botón en ERP.
- El CSV de viajes es **incompleto** (sin primas, peajes, splits completos).
- No hay **API Key**, paginación ni contrato estable para un tercero.

Convertir la lógica interna (`listBillingReport`, agregaciones, liquidaciones, multi-empresa) en una **API segura y documentada** es un proyecto de ingeniería completo, no un interruptor.

#### Mensaje clave

> **~2.000 € = FleetHub para operar la flota.**  
> **7.000 € = conectar esa flota con vuestro ERP de forma automática y fiable.**  
> Sin la API seguís dependiendo de Excel manual o de un desarrollo interno mucho más caro (15.000–40.000 €+).

*(Ver también §11 — argumentario completo API vs FleetHub y objeción Cap9.)*

### 7.2 Módulos opcionales

| Módulo | Importe |
|--------|---------|
| Webhooks salientes (`liquidation.closed`) | **1.800 €** |
| Export Excel server-side (Facturación) | **900 €** |

### 7.3 Mantenimiento mensual (opcional)

**Cuota:** **2.000 €/mes** (IVA no incluido) · facturación mensual.

Incluye soporte continuo de **FleetHub** y de la **integración API con vuestro ERP**, dentro del alcance operativo acordado. Las horas no se facturan por separado salvo proyectos fuera de alcance (nuevos módulos, cambios mayores de ERP, etc.).

#### Tipos de trabajo incluidos

| Área | Trabajos incluidos |
|------|-------------------|
| **Integración ERP** | Soporte a la API de lectura (consultas, incidencias de importación, ajustes de contrato JSON, nuevos filtros menores, rotación de API Key, actualización OpenAPI) |
| **Plataformas Uber / FreeNow** | Monitorización de sync, corrección de desfases de datos, reconexión de conductores, importación de nuevos socios, ajustes de primas/comisiones/cobros, backfills puntuales acordados |
| **Facturación y liquidaciones** | Corrección de discrepancias vs portal de plataforma, validación de pagos, cierre de turnos, exports Excel/CSV, alineación de KPIs (T3, primas, peajes, splits app/efectivo/tarjeta) |
| **Incidencias y bugs** | Diagnóstico y corrección de errores en producción (UI, API, worker, ingesta) |
| **Infraestructura y despliegue** | Actualizaciones de seguridad, parches, reinicios controlados, revisión de logs, salud de servicios (web, API, worker, base de datos) |
| **Conductores y empresas** | Altas/bajas operativas en maestros, vinculación plataforma, multi-empresa / multi-tenant, permisos y scope |
| **Monitorización sync** | Revisión periódica de KPIs de ingesta (webhooks, polling, colas, viajes pendientes), alertas y reintentos |
| **Soporte al cliente / ERP** | Canal de consultas técnicas (email o reunión quincenal/mensual según acuerdo), coordinación con vuestro equipo de desarrollo ERP |
| **Documentación** | Actualización de guías de integración y notas de cambio cuando se modifique la API |
| **Mejoras menores** | Pequeños ajustes de UX, informes o campos adicionales que no requieran un nuevo proyecto (presupuesto aparte si supera el alcance mensual) |

#### Niveles de servicio (incluidos)

| Concepto | Compromiso |
|----------|------------|
| **Horario de respuesta** | Lunes–viernes, 9:00–18:00 (Europe/Madrid) |
| **Incidencias críticas** (producción caída o sync parado) | Respuesta inicial ≤ 4 h laborables |
| **Incidencias normales** | Respuesta inicial ≤ 24 h laborables |
| **Mejoras menores** | Planificadas en el mes según prioridad acordada |
| **Reuniones** | 1 reunión de seguimiento / mes (30–60 min, remoto) |

#### Fuera del mantenimiento mensual (presupuesto aparte)

- Desarrollo o cambios en el **ERP del cliente**.
- Nuevos módulos grandes (webhooks masivos, nuevas plataformas Bolt/Cabify, ERP bidireccional).
- Proyectos de refactor, migraciones de datos históricos masivos o informes a medida.
- SLA 24×7 o guardias fuera de horario laborable.

### 7.4 Condiciones generales

- Validez de la oferta: **60 días** desde la fecha del documento.  
- Cambios de alcance fuera del MVP: presupuesto y plazo revisados por escrito.  
- El cliente facilita **contacto técnico del ERP** y acceso a entorno de pruebas para UAT.  
- FleetHub no incluye desarrollo en el ERP del cliente (solo API y documentación).  

---

## 8. Puntos a cerrar en reunión

Antes de iniciar H0, acordar:

| # | Tema | Decisión |
|---|------|----------|
| 1 | Granularidad | ¿Solo totales agregados o también detalle viaje a viaje? |
| 2 | Criterio de fecha | ¿Fecha de servicio, fecha de cierre en caja, o ambos? |
| 3 | Estado de viajes | ¿Solo cerrados o también pendientes? |
| 4 | Formato importes | ¿Euros con decimales (48,75) o céntimos enteros (4875)? |
| 5 | Identificadores ERP | ¿DNI, CIF, ID plataforma, ID FleetHub? |
| 6 | Multi-empresa | ¿Una API Key por operador o por razón social? |
| 7 | Frecuencia sync | Manual, diaria u horaria |
| 8 | Volumen estimado | Viajes/mes (para dimensionar paginación) |
| 9 | Fase 2 | ¿Interesa webhook al cerrar turno? |

---

## 9. Fuera de alcance

- Desarrollo o modificación del ERP del cliente.  
- Escritura de datos en FleetHub desde el ERP.  
- Sustituir la liquidación interna del ERP.  
- Conexión directa ERP ↔ Uber/FreeNow (FleetHub sigue siendo el único conector).  
- Histórico anterior a datos ya ingeridos en FleetHub (salvo backfill acordado aparte).  

---

## 10. Seguridad y privacidad

- Comunicaciones cifradas (HTTPS / TLS 1.2+).  
- API Key almacenada de forma segura; revocable en cualquier momento.  
- Aislamiento estricto por operador (multi-tenant).  
- Tratamiento de datos personales conforme a RGPD; DPA según contrato marco.  

---

## 11. Por qué la integración API tiene un coste distinto al acceso a FleetHub

FleetHub y la **API para vuestro ERP** resuelven problemas diferentes. No es un “acceso extra” a la misma pantalla: es **infraestructura a medida** para alimentar vuestro sistema de liquidaciones y contabilidad.

### 11.1 Son dos productos distintos

| | FleetHub (SaaS operativo) | API integración ERP |
|---|---------------------------|---------------------|
| **Para quién** | Gestores de flota, caja, supervisores | Vuestro equipo técnico / ERP |
| **Para qué** | Validar pagos, cerrar turnos, facturación visual | Automatizar liquidaciones en **vuestro** ERP |
| **Uso** | Personas en navegador | Máquinas 24/7 (cron, botón «Actualizar plataformas») |
| **Valor** | Operativa diaria de la flota | **Core business**: nóminas, cierres, contabilidad |

La cuota de FleetHub cubre la operativa de flota. La API cubre **exportar datos fiables hacia vuestro sistema nervioso**.

### 11.2 Motivos de valor (por qué merece un presupuesto propio)

1. **Evitáis construirlo vosotros**  
   Conectar Uber + FreeNow al ERP, normalizar cobros, primas, T3 y mantenerlo cuando las plataformas cambian supondría **meses de desarrollo interno** + mantenimiento continuo. La API os entrega eso ya resuelto.

2. **Un solo conector, varias plataformas**  
   El ERP no habla con Uber ni FreeNow directamente. FleetHub absorbe webhooks, sync, errores de API, rate limits y multi-org. Vosotros consumís **un contrato JSON estable**.

3. **Datos listos para liquidar, no crudos**  
   No recibís un volcado bruto: recibís importes en céntimos, splits app/efectivo/tarjeta, comisiones, primas, peajes, estado cerrado/pendiente y maestros conductor/empresa — la misma lógica que Facturación, **sin reimplementarla en el ERP**.

4. **Contrato estable y documentado**  
   OpenAPI, versionado (`/api/v1/…`), paginación, API Key, logs de acceso. Eso implica **diseño, pruebas y compromiso de no romper** vuestro import en cada actualización de FleetHub.

5. **Proyecto a medida con vuestro ERP**  
   Requiere kick-off, mapeo de campos (DNI, CIF, IDs), sandbox, UAT conjunta y ajustes según **vuestra** lógica de import. No es activar un interruptor: es una **integración B2B** con dos equipos.

6. **Crítico para el negocio**  
   Un fallo en FleetHub afecta la operativa de un día. Un fallo en la API puede afectar **liquidaciones, nóminas y cierre contable**. El nivel de exigencia (precisión, trazabilidad, soporte) es mayor.

7. **Seguridad y cumplimiento adicionales**  
   API Key dedicada, HTTPS, auditoría de accesos, aislamiento por tenant, RGPD en exportación masiva de datos de conductores. Capa extra respecto al login web habitual.

8. **Mantenimiento cuando cambian las plataformas**  
   Uber y FreeNow modifican informes, campos y reglas (primas, comisiones, autorizaciones). FleetHub adapta la ingesta; la API **mantiene el contrato** para que vuestro ERP no tenga que enterarse de cada cambio de plataforma.

9. **Soporte a dos bandas**  
   Incidencias pueden ser de FleetHub, de la API o de cómo el ERP interpreta la respuesta. El mantenimiento mensual incluye **coordinación con vuestro desarrollador**, no solo tickets de usuario final.

10. **Ahorro de tiempo operativo real**  
    Sustituir exportaciones manuales Excel + conciliación a ojo por un sync automático libera horas cada semana de administración y reduce errores de liquidación — el ROI suele superar con creces el coste del proyecto.

11. **No diluye el coste entre todos los clientes**  
    La integración ERP es **específica de vuestro operador y vuestro ERP**. El desarrollo, la UAT y el soporte posterior no se reparten en la cuota base de FleetHub, que está pensada para el producto estándar.

12. **Escalabilidad sin rehacer el ERP**  
    Cuando incorporéis conductores, empresas o subáis volumen de viajes, la API escala con paginación y filtros sin que tengáis que re-diseñar importaciones.

### 11.3 Comparativa de esfuerzo (referencia)

| Enfoque | Coste estimado | Plazo | Riesgo |
|---------|----------------|-------|--------|
| **API FleetHub (propuesta)** | 7.000 € MVP + mantenimiento acordado | 1–2 semanas | Bajo — datos ya validados en producción |
| **Desarrollo interno ERP ↔ plataformas** | 15.000–40.000 €+ (según equipo) | 3–6 meses | Alto — APIs Uber/FN, normativa, cambios continuos |
| **Export Excel manual recurrente** | “Gratis” en licencia | Horas/semana para siempre | Medio — errores humanos, desfases, no automatizable |

### 11.4 Mensaje clave para la reunión

> **FleetHub os gestiona la flota. La API os alimenta el ERP.**  
> Pagáis por dejar de mantener un puente frágil (Excel, scrapers, imports manuales) y por tener **datos de plataformas fiables dentro de vuestras liquidaciones**, con contrato, soporte y evolución garantizados.

### 11.5 Objeción habitual: «Cap9 / SaaS por coche ≈ 2.000 €/mes»

Es normal que el importe choque si se compara solo el **número mensual** (~10 €/coche × 200 coches ≈ 2.000 €/mes) con nuestro **mantenimiento de 2.000 €/mes**. La respuesta no es discutir la cifra, sino **qué incluye cada cosa**.

| | SaaS tipo Cap9 (~10 €/coche) | Mantenimiento FleetHub + API ERP |
|---|------------------------------|----------------------------------|
| **Qué es** | Herramienta SaaS genérica por vehículo | Operación integral + puente hacia **vuestro** ERP |
| **Integración ERP a medida** | No | Sí — API, OpenAPI, soporte al desarrollador |
| **Sync Uber / FreeNow** | Limitado o inexistente | Ingesta híbrida (webhook + polling), linking, backfills |
| **Normalización liquidación** | No equivalente | Primas, comisiones, T3, splits app/efectivo/tarjeta |
| **Servidor / despliegue / parches** | Incluido en su SaaS | Incluido |
| **Soporte cuando falla el import ERP** | No | Sí — coordinación con vuestro equipo técnico |
| **Evolución cuando Uber/FN cambian APIs** | No vuestro problema (ni solución) | Absorbido por FleetHub; contrato API estable para el ERP |

**Frase clave:**

> *Cap9 os da una herramienta por coche. FleetHub + mantenimiento os mantiene el **puente** entre plataformas y vuestro ERP. Son capas distintas; podéis usar las dos si cubren necesidades diferentes.*

**Si solo necesitan operativa básica por coche** y liquidan manualmente, Cap9 puede bastar. **Si el ERP es donde cerráis nóminas y contabilidad**, la API evita Excel semanal y errores de liquidación — ahí está el valor.

### 11.6 Por qué 2.000 €/mes de mantenimiento (no es «solo software»)

El mantenimiento **no es una segunda licencia SaaS**. Cubre trabajo recurrente que Cap9 no incluye:

- Infraestructura (servidor, SSL, backups, actualizaciones de seguridad)
- Monitorización sync Uber / FreeNow (webhooks, colas, reintentos, incidencias)
- Corrección de desfases vs portales (primas, horarios, cobros, conductores nuevos)
- Soporte a la API y al desarrollador del ERP (incidencias de import, ajustes de contrato)
- Mejoras menores y documentación cuando evoluciona la integración
- 1 reunión de seguimiento / mes

**Comparativa honesta de costes ocultos sin mantenimiento:**

| Sin mantenimiento acordado | Consecuencia |
|----------------------------|--------------|
| Uber cambia un informe | Import ERP roto hasta presupuesto aparte |
| Conductor nuevo en plataforma | No entra solo; hay que intervenir manualmente |
| Desfase primas / liquidación | Horas de conciliación Excel |
| Caída sync un viernes | Liquidación del fin de semana en riesgo |

**Alternativas si 2.000 €/mes es alto** (a negociar, no incluidas en oferta base):

| Plan | Cuota orientativa | Alcance |
|------|-------------------|---------|
| **Esencial** | ~800–1.000 €/mes | API operativa, bugs críticos, respuesta 48 h |
| **Estándar** (propuesta) | **2.000 €/mes** | Alcance completo §7.3 |
| **Sin mantenimiento** | 0 €/mes | Solo 30 días garantía post go-live; resto presupuesto aparte |

---

## 12. Próximos pasos

1. Reunión de alineación (checklist §8).  
2. Firma de propuesta y pago hito H1.  
3. Kick-off H0 — entrega sandbox en **48–72 h**.  
4. Desarrollo H1–H2 — demo en sandbox.  
5. UAT conjunta H3 — go-live en producción.  

Quedamos a vuestra disposición para concretar cualquier punto en la reunión.

---

**FleetHub**  
*Documento confidencial — uso del destinatario*
