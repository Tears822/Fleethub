# FleetHub — Propuesta de monitorización de sincronización

**Documento para revisión del cliente**  
**Versión:** 1.1 · Mayo 2026  
**Ámbito:** Ingesta de datos Uber / FreeNow (webhooks + polling de respaldo)

---

## 1. Objetivo

Definir qué indicadores (KPIs) conviene medir en la pantalla **Monitorización sync** (Super Admin) y, en una segunda capa, en **Configuración → Integraciones** por operador, para garantizar que los viajes y cobros de las plataformas llegan a FleetHub de forma **completa, puntual y sin duplicados**.

Este documento recoge la propuesta técnica de FleetHub sobre los KPIs que habéis planteado (incluida la **cola de reintentos pendientes**, v1.1), el orden de implementación recomendado y las decisiones que conviene cerrar antes de desarrollar.

---

## 2. Contexto: estrategia híbrida de ingesta

La arquitectura acordada combina:

| Canal | Rol |
|-------|-----|
| **Webhooks** | Canal principal: eventos en tiempo casi real cuando la plataforma los envía. |
| **Polling de respaldo** | Se activa solo cuando falta actividad de webhook o hay huecos detectables; no sustituye al canal principal. |
| **Sincronización manual** | Acción puntual del administrador/gestor para recuperar datos (complemento, no métrica de “salud del webhook”). |

En una estrategia híbrida, los KPIs más críticos son los que detectan **pérdida de datos**, **duplicados por colisión webhook/poll** y **degradación del canal principal** (cuántas veces tuvo que entrar el fallback).

---

## 3. Estado actual en FleetHub (línea base)

Hoy la monitorización es un **punto de partida limitado**:

- Existe registro de **ejecuciones de sync** por operador y plataforma (éxito / fallo), visible en Super Admin y en el historial de Configuración.
- Los viajes se identifican de forma única por operador + plataforma + identificador externo (`externalTripId`), lo que **evita filas duplicadas** en base de datos, pero **no cuenta** cuántas veces el mismo viaje intentó ingresarse por dos vías.
- Las alertas de “ingesta desactualizada” se basan en la última sync correcta registrada; es un **proxy útil**, pero no distingue aún webhook vs polling automático vs sync manual.
- La ingesta por **webhooks** está prevista en producto; la **telemetría por evento** (latencia, duplicados, éxito de API por llamada) aún no está desplegada.
- Existe cola de trabajos de sync (**BullMQ** + Redis) con reintentos automáticos; aún **no** se expone en UI el tamaño de la cola de reintento en tiempo real.

**Conclusión:** los KPIs que proponéis son acertados; para medirlos con rigor hace falta una capa de **eventos de ingesta** además del historial de sync por lotes.

---

## 4. KPIs propuestos — valoración y definición

### 4.1 Tasa de pérdida de viajes

**Definición propuesta**  
Porcentaje de viajes **finalizados en Uber/FreeNow** que no quedan registrados en FleetHub dentro de una **ventana esperada** (ej. 15–60 minutos tras el cierre del viaje en plataforma).

**Valor**  
Máxima prioridad de negocio: detecta impacto directo en facturación, liquidación y analítica.

**Consideraciones**

- No se puede calcular solo con datos internos de FleetHub; requiere **reconciliación periódica** con la “verdad” de la plataforma (consulta o export de historial por conductor y rango de fechas).
- Hay que separar **retraso de ingesta** (latencia alta) de **pérdida real** (el viaje nunca aparece tras la ventana).
- Recomendación: informe de reconciliación (diario o cada 6 h), con desglose por operador, plataforma y conductor.

**Fase sugerida:** 3 (tras instrumentación y KPIs operativos).

---

### 4.2 Tasa de datos duplicados

**Definición propuesta**  
Proporción de viajes o cobros donde el mismo identificador externo se intenta ingresar **más de una vez** por distintas fuentes (webhook + polling), aunque la base de datos lo resuelva con actualización (`upsert`) y no genere dos filas.

**Valor**  
Esencial en estrategia híbrida: indica colisiones, reintentos mal gestionados o desfase entre canales.

**Consideraciones**

- Medir **intentos duplicados**, no filas duplicadas en tabla.
- Registrar origen del primer evento vs eventos posteriores (`webhook`, `poll_fallback`, `poll_manual`, `reconcile`).

**Fase sugerida:** 2 (en cuanto exista ingesta webhook + polling automático).

---

### 4.3 Cobertura de conductores

**Definición propuesta**  
Porcentaje de conductores **activos en plataforma** que tienen al menos un dato sincronizado en FleetHub en las **últimas 24 horas** (viaje, actualización de cuenta o evento equivalente).

**Valor**  
Muy accionable para operaciones: detecta conductores “huérfanos” (activos fuera pero invisibles dentro).

**Consideraciones**

- **Numerador:** conductores con cuenta vinculada y actividad reciente en FleetHub.
- **Denominador:** conductores activos según plataforma; si la API no lo expone de forma directa, se puede empezar con un **proxy** (conductores con viaje en plataforma en los últimos 7 días) y refinar después.
- Útil en Super Admin (vista global) y en alertas por operador.

**Fase sugerida:** 1 (versión proxy) → refinamiento con API de plataforma.

---

### 4.4 Integridad de cobros

**Definición propuesta**  
Diferencia entre el **importe total de viajes en plataforma** y el **importe registrado en FleetHub**, por periodo y por conductor (y agregado por operador).

**Valor**  
Crítica para confianza en facturación y liquidación.

**Consideraciones**

- Requiere alinear reglas: bruto vs neto, propinas, peajes, cancelaciones, divisas.
- Encaja como **informe de reconciliación**, no como cifra en tiempo real en dashboard.
- Misma base de datos de reconciliación que la tasa de pérdida de viajes.

**Fase sugerida:** 3.

---

### 4.5 Latencia de sincronización (p50, p95, p99)

**Definición propuesta**  
Tiempo entre el **momento del evento en plataforma** (o cierre del viaje) y el **registro efectivo en FleetHub**.

**Valor**  
Indicador SRE/operaciones: SLA del canal, impacto en turnos y alertas en tiempo casi real.

**Consideraciones**

- Medir por **evento**, no por media simple; mostrar **p50, p95 y p99** por separado.
- Sin timestamp de plataforma en cada evento, solo se puede **estimar** (menos fiable).
- Desglose por plataforma y por operador.

**Fase sugerida:** 2 (cuando los webhooks estén operativos).

---

### 4.6 Tasa de éxito de llamadas API

**Definición propuesta**  
Porcentaje de llamadas a las APIs de Uber y FreeNow que devuelven respuesta válida (HTTP 2xx y payload utilizable), desglosado por **plataforma** y por **tipo de operación** (listado de viajes, estado de conductor, etc.).

**Valor**  
Imprescindible para diagnosticar credenciales, rate limits, caídas de plataforma o cambios de contrato.

**Consideraciones**

- Registrar duración, código de error y mensaje tipado (auth, 429, 5xx).
- Retención recomendada: 7–30 días de detalle; agregados más largos.

**Fase sugerida:** 1 (prioridad alta).

---

### 4.7 Activaciones de polling — ratio de fallback

**Definición propuesta**  
Porcentaje de ocasiones en las que el sistema activó el **polling automático de respaldo** por ausencia o insuficiencia de webhooks, respecto al total de ventanas donde se esperaba ingesta por webhook.

**Valor**  
Mide la salud del canal principal: un ratio alto indica webhooks mal configurados, caídas o retrasos sistemáticos.

**Consideraciones**

- **No** incluir la sincronización manual del botón “Actualizar datos” en el mismo ratio (es acción humana, no fallback).
- Taxonomía recomendada de orígenes:
  - `webhook`
  - `poll_fallback` (automático)
  - `poll_manual` (usuario)
  - `reconcile` (job de reconciliación)

**Fase sugerida:** 1 (cuando exista polling automático por reglas de stale); hasta entonces el ratio sería engañoso.

---

### 4.8 Cola de reintentos pendientes

**Definición propuesta**  
Número de **eventos o trabajos en cola de reintento en cada momento** (métrica instantánea, no acumulada del día). Incluye trabajos que aguardan el siguiente intento tras un fallo transitorio (p. ej. rate limit, timeout, error 5xx de plataforma o worker saturado).

**Valor**  
Complementa el éxito de API y el ratio de fallback: un **pico puntual** puede ser normal (caída breve de Uber/FreeNow); un **pico sostenido** o una **tendencia al alza** suele indicar un problema **sistémico** (credenciales, cambio de API, worker caído, Redis saturado, backoff mal dimensionado), no un incidente aislado.

**Consideraciones**

- Medir como **gauge** (valor actual), con histórico para gráfica (últimas 24 h / 7 días) y alertas por umbral y por duración del pico.
- Desglosar por **cola** cuando existan varias:
  - Ingesta webhook (reintento de procesar payload).
  - Sync por plataforma (jobs BullMQ de polling / reconciliación).
  - Reconciliación o export pesado (si va en cola aparte).
- En la implementación actual, la cola de sync usa **BullMQ** con reintentos (p. ej. 3 intentos y backoff exponencial); la métrica se obtiene del estado de la cola (`delayed` + trabajos en espera de reintento), no solo del contador de fallos ya persistidos en base de datos.
- Diferenciar en dashboard:
  - **Pendientes de reintento** (volverán a ejecutarse).
  - **Fallidos definitivos** / dead-letter (requieren intervención); no sumar al mismo número sin etiquetar.
- Umbrales orientativos a acordar: alerta si la cola supera X eventos durante más de Y minutos (ej. más de 50 pendientes durante 15 min en horario punta).

**Fase sugerida:** 1 (junto con telemetría de colas y éxito de API; no depende de reconciliación con plataforma).

---

## 5. Resumen: KPIs recomendados

| KPI | ¿Mantener? | Uso principal | Fase |
|-----|------------|---------------|------|
| Pérdida de viajes | Sí | Negocio / reconciliación | 3 |
| Datos duplicados | Sí | Calidad canal híbrido | 2 |
| Cobertura de conductores | Sí | Operaciones por operador | 1 |
| Integridad de cobros | Sí | Negocio / reconciliación | 3 |
| Latencia p50 / p95 / p99 | Sí | SLA y rendimiento | 2 |
| Éxito de llamadas API | Sí | Diagnóstico técnico | 1 |
| Ratio polling fallback | Sí | Salud del webhook | 1* |
| Cola de reintentos pendientes | Sí | Salud operativa / capacidad | 1 |

\*Requiere polling automático de respaldo implementado y etiquetado; no mezclar con sync manual.

---

## 6. Arquitectura de datos recomendada

Antes de construir la UI de KPIs, se propone un registro unificado de eventos (nombre orientativo: `ingestion_event`):

| Campo (conceptual) | Descripción |
|--------------------|-------------|
| Operador, plataforma | Tenant y Uber / FreeNow |
| Entidad | Viaje, cobro, conductor |
| Identificador externo | ID del viaje en plataforma |
| Origen | webhook, poll_fallback, poll_manual, reconcile |
| Timestamps | Momento en plataforma, recepción, procesado |
| Resultado | creado, actualizado, duplicado, ignorado, error |
| Latencia | ms entre plataforma y registro |
| Error | Código y mensaje si falla |

Sobre estos eventos:

- **Agregados horarios** para Super Admin (24 h / 7 días).
- **Vista acotada** por operador en Configuración.
- **Retención:** detalle 30–90 días; agregados más prolongados.

El historial actual de sync por lotes se mantiene para jobs grandes; no sustituye al registro por evento.

**Colas (BullMQ / Redis)** — métricas en tiempo casi real, alimentan el KPI de reintentos pendientes:

| Métrica (conceptual) | Descripción |
|----------------------|-------------|
| `retry_pending` | Trabajos en espera del siguiente intento (`delayed` + reintentos programados) |
| `active` | En ejecución ahora |
| `failed` | Agotados reintentos o error definitivo (dead-letter) |
| `completed_rate` | Throughput para detectar estancamiento |

Muestreo recomendado: cada 30–60 s; retención de series temporales 7–30 días para gráficas en Super Admin.

---

## 7. Evolución de la pantalla Monitorización sync

**Hoy:** listado de errores de sync (últimos 7 días).

**Propuesta:**

1. **Bloque de KPIs** (24 h y 7 días): éxito API, **reintentos pendientes (ahora + tendencia)**, latencia p95, cobertura, % fallback, intentos duplicados, pérdidas detectadas en reconciliación.
2. **Gráfica de cola:** reintentos pendientes vs fallidos definitivos en las últimas 24 h.
3. **Desglose** por plataforma y por operador (peores N).
4. **Flujo de eventos** recientes (fallos, duplicados, alertas de reconciliación, jobs que agotaron reintentos).
5. **Filtros:** operador, plataforma, rango de fechas (mismo patrón que otros informes Super Admin).

En **Configuración → Integraciones**, cada operador vería solo sus métricas y el historial de sync, sin datos de otros tenants.

---

## 8. Plan de implementación sugerido

| Fase | Entregable | KPIs visibles |
|------|------------|---------------|
| **0 — Instrumentación** | Registro de eventos de ingesta + origen en cada alta/actualización de viaje | (preparación) |
| **1 — Operación** | Telemetría de APIs y colas (BullMQ), cobertura (proxy), ratio fallback*, alertas de ingesta mejoradas | Éxito API, **cola reintentos**, cobertura, fallback |
| **2 — Calidad de canal** | Webhooks en producción + duplicados y latencia | Duplicados, p50/p95/p99 |
| **3 — Negocio** | Jobs de reconciliación con plataforma | Pérdida de viajes, integridad de cobros |

\*Fase 1 del ratio fallback cuando el polling automático esté activo según reglas acordadas.

---

## 9. Decisiones a cerrar con el cliente

Para evitar ambigüedades en fórmulas y alertas:

1. **Ventana de “pérdida de viaje”** (ej. 30 vs 60 min) y relación con el SLA de latencia (evitar contar el mismo problema dos veces).
2. **Definición operativa de “conductor activo en plataforma”** para el denominador de cobertura.
3. **Reglas de importe** en integridad de cobros: bruto, neto, propinas, peajes, cancelaciones.
4. **Política de polling automático:** cuándo se dispara, frecuencia máxima y si es global o por operador (recordatorio: polling agresivo configurable por tenant no está previsto por riesgo de bloqueo en plataformas).
5. **Alcance de alertas:** ¿solo Super Admin o también email/notificación al administrador del operador?
6. **Umbrales de alerta** (ej. pérdida superior al 0,5 %, p95 superior a 10 min, éxito API inferior al 99 %).
7. **Cola de reintentos:** umbral de volumen (ej. eventos pendientes) y **duración mínima del pico** antes de alertar (distinguir incidente puntual vs sistémico).
8. **Política de reintentos:** número máximo de intentos, backoff y qué ocurre al agotarlos (dead-letter, notificación, reintento manual).

---

## 10. Recomendación ejecutiva

Los ocho KPIs que habéis enumerado (incluida la **cola de reintentos pendientes**) son **coherentes y complementarios**. La recomendación de FleetHub es:

1. **No** implementar primero todos los números en pantalla sin la capa de eventos de ingesta (salvo métricas de cola y API, que ya se pueden exponer con BullMQ/Redis).
2. **Priorizar** éxito de API, **profundidad de cola de reintento**, cobertura y (cuando exista) ratio de fallback para detectar roturas en horas.
3. **Añadir** duplicados y latencia cuando el webhook esté en producción.
4. **Cerrar** pérdida de viajes e integridad de cobros con jobs de reconciliación periódicos contra plataforma.

Con este orden se obtiene valor operativo pronto y se evita un dashboard con métricas poco fiables o mezcladas (p. ej. tratar la sync manual como “fallo del webhook”).

---

## 11. Próximo paso

Tras vuestra revisión de este documento:

- Validar definiciones y fases (tabla §5 y §8).
- Responder las decisiones del §9.
- FleetHub puede entregar un **mini-spec técnico** (esquema de datos + fórmulas + umbrales) para estimación y planificación de desarrollo.

---

*FleetHub · Documento de propuesta — Monitorización sync*
