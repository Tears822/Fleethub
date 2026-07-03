# FleetHub — Cancelaciones pagadas no reflejadas

**Para:** Cliente (operador de flota)  
**De:** FleetHub  
**Fecha:** Julio 2026  
**Versión:** 1.0

---

## 1. Resumen ejecutivo

Hemos revisado el aviso de que **Uber y FreeNow pagan cancelaciones de servicio** (compensación al conductor o a la flota) pero **esas cantidades no aparecen en FleetHub** en Facturación, cierre de turnos ni liquidaciones.

**Conclusión:** no es un fallo puntual de sincronización ni un problema de credenciales. Es una **limitación del diseño actual de importación**: FleetHub solo registra **viajes completados**. Las cancelaciones con importe quedan fuera del flujo de ingesta.

La solución requiere **desarrollo específico** en los conectores Uber y FreeNow, pruebas con casos reales y un **backfill** del histórico acordado.

| | |
|---|---|
| **Plazo estimado** | 5–8 días laborables |
| **Presupuesto** | **1.200 €** (IVA no incluido) |
| **Pago** | Por hitos — ver §8 |

---

## 2. Problema reportado

| Síntoma | Impacto |
|---------|---------|
| En el portal Uber/FreeNow aparece un importe por cancelación (conductor cobra compensación). | El operador ve el cobro en plataforma. |
| En FleetHub no existe ese servicio / no suma en totales. | Descuadre en facturación, cierre de caja y liquidación. |
| Puede afectar a varios conductores y días. | Diferencias acumuladas difíciles de detectar manualmente. |

---

## 3. Causa técnica (confirmada)

### 3.1 Comportamiento actual de FleetHub

FleetHub importa **servicios completados** y los normaliza como registros de viaje (`trips`) con importes (bruto, comisión, neto, app/efectivo/tarjeta, etc.).

Las reglas actuales son:

| Plataforma | Qué se importa hoy | Qué se descarta |
|------------|-------------------|-----------------|
| **Uber** | Viajes con estado *completed* / *completado* en informes de actividad y pagos. | Cancelaciones, filas de pago sin viaje completado, compensaciones en columnas de cancelación del CSV de pagos. |
| **FreeNow** | Reservas con estado `ACCOMPLISHED`. | Reservas `CANCELED` (aunque la API incluya importe o la plataforma haya abonado compensación). |

En FreeNow, las cancelaciones solo se usan hoy para **métricas operativas** (conteo de rechazos en KPIs diarios), **no** para facturación ni liquidación.

### 3.2 Por qué ocurre

Las plataformas tratan la cancelación pagada como un **evento económico distinto** de un viaje completo:

- Puede no tener hora de fin de servicio.
- El importe puede venir en columnas específicas (*cancelación*, *cancellation fee*, etc.).
- En FreeNow puede figurar como reserva cancelada con compensación en informes de earnings, no como tour realizado.

FleetHub **nunca implementó** esa variante; por eso el sync puede estar en verde y aun así faltar dinero en pantalla.

### 3.3 Qué no es

- No es lo mismo que el tema de **sync lenta** en Uber (Cosculluela multi-organización).
- No es lo mismo que viajes **PARTIAL** (viaje importado sin importe porque Uber aún no publicó el pago).
- No se corrige reiniciando el worker ni forzando sync manual.

---

## 4. Solución propuesta

### 4.1 Enfoque

Registrar las **cancelaciones pagadas** como **líneas de servicio** en FleetHub, visibles donde el operador ya consulta ingresos:

- Listado de viajes / servicios del conductor  
- Facturación y totales por periodo  
- Cierre de turnos (misma lógica de app/efectivo/tarjeta cuando aplique)  
- Exportaciones y, en su momento, API ERP  

Cada cancelación tendrá:

| Campo | Valor propuesto |
|-------|-----------------|
| Identificador | ID de la reserva/viaje en plataforma + sufijo estable (p. ej. `::cancel`) |
| Tipo / tarifa | Etiqueta clara: **«Cancelación (Uber)»** / **«Cancelación (FreeNow)»** |
| Fecha del servicio | Fecha de la solicitud o de abono según regla acordada con el portal |
| Importes | Bruto, comisión y neto alineados con el informe de plataforma |
| Cobro | App / efectivo / tarjeta según método en plataforma |

### 4.2 Uber

1. Leer filas de compensación por cancelación en informes **Payments Order** / **Payments Driver** (columnas de cancelación en CSV español e inglés).  
2. Aceptar estados distintos de *completed* cuando exista **importe de cancelación > 0**.  
3. Crear o actualizar el registro en FleetHub sin confundirlo con un viaje normal (tipo de tarifa dedicado).  
4. Evitar duplicados si la misma cancelación aparece en activity + payments.

### 4.3 FreeNow

1. Ampliar el mapper de reservas para detectar `CANCELED` **con compensación económica** (importe en booking o cruce con earnings `cancellations`).  
2. Importar solo cuando haya importe > 0 (cancelaciones sin pago siguen ignoradas).  
3. Misma visibilidad en facturación y cierre de turnos que Uber.

### 4.4 Backfill histórico

Tras desplegar el fix:

- Re-sincronizar ventana acordada (propuesta: **desde 01/06/2026** o últimos **90 días**, lo que cubra más operativa).  
- Informe de reconciliación: cancelaciones insertadas por tenant / conductor / día.  
- Validación cruzada con 2–3 conductores de ejemplo que el cliente indique.

### 4.5 UI (alcance mínimo)

- Mostrar tipo **Cancelación** en listados y facturación (sin rediseño de pantallas).  
- Opcional fase 2: filtro «Solo cancelaciones» y línea dedicada en resumen de facturación.

---

## 5. Entregables

| # | Entrega |
|---|---------|
| E1 | Conector Uber: ingesta de cancelaciones pagadas |
| E2 | Conector FreeNow: ingesta de cancelaciones pagadas |
| E3 | Tests automáticos con CSV/API de ejemplo |
| E4 | Backfill histórico + informe de reconciliación |
| E5 | Despliegue en producción (`taxifleet.es` / entorno acordado) |
| E6 | Nota de cierre con casos verificados |

---

## 6. Plazo

| Fase | Duración |
|------|----------|
| Análisis con 2–3 ejemplos reales del cliente | 1 día |
| Desarrollo Uber + FreeNow + tests | 2–3 días |
| Backfill + validación | 1–2 días |
| Despliegue y verificación en producción | 1 día |
| **Total** | **5–8 días laborables** |

*El plazo arranca cuando recibamos al menos un ejemplo verificado por plataforma (captura portal + conductor + fecha).*

---

## 7. Qué necesitamos del cliente

Para cerrar reglas de negocio y evitar reinterpretaciones:

1. **2–3 casos Uber** — conductor, fecha, importe en portal, captura si es posible.  
2. **2–3 casos FreeNow** — mismo detalle.  
3. Confirmar **fecha de servicio** que debe usarse en FleetHub (solicitud vs día de abono).  
4. Confirmar **ventana de backfill** (90 días / desde fecha concreta).  
5. Indicar si las cancelaciones deben entrar en **cierre de turnos automático** igual que un viaje app.

---

## 8. Presupuesto y hitos de pago

| Hito | Contenido | Importe | % |
|------|-----------|---------|---|
| **H0** | Aceptación + recepción de casos de ejemplo | 240 € | 20 % |
| **H1** | Desarrollo y tests (Uber + FreeNow) | 480 € | 40 % |
| **H2** | Backfill + informe de reconciliación | 360 € | 30 % |
| **H3** | Producción + validación con cliente | 120 € | 10 % |
| | **Total** | **1.200 €** | 100 % |

IVA no incluido. Fuera de alcance: cambios en el ERP del cliente, rediseño de UI avanzado, histórico anterior a la ventana acordada sin presupuesto adicional.

---

## 9. Anexo — Migración `taxifleet.es` y servidor IONOS

*(Relacionado con la conversación de infraestructura; independiente del presupuesto de cancelaciones.)*

### 9.1 Recomendación de máquina (IONOS)

Para evitar cuellos de botella con sync Uber multi-organización, worker, API, web y base de datos **en servidor dedicado**:

| Perfil | vCPU | RAM | Disco | Uso |
|--------|------|-----|-------|-----|
| **Recomendado** | 8 | 32 GB | 256 GB NVMe | Producción con margen |
| **Mínimo** | 4 | 16 GB | 160 GB NVMe | Arranque ajustado |

- SO: **Ubuntu 24.04 LTS**  
- Servicios: PostgreSQL, Redis, FleetHub API, Web, Worker  
- Migración propuesta: **servidor + base de datos en la misma ventana** (2–4 h mantenimiento), cutover DNS a **taxifleet.es**

### 9.2 Presupuesto migración (orientativo)

La migración a servidor dedicado y dominio definitivo se presupuesta **aparte** una vez confirmado el plan IONOS (típicamente 400–800 € según ventana, pruebas y rollback plan).

---

## 10. Próximos pasos

1. Cliente envía casos de ejemplo (§7) y confirma ventana de backfill.  
2. FleetHub confirma presupuesto y plazo (este documento).  
3. Pago hito H0 → desarrollo → backfill → producción.  
4. En paralelo, si procede: pedido de servidor IONOS según §9.

---

*Documento preparado por FleetHub — Julio 2026.*
