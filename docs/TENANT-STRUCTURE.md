# FleetHub — Estructura de tenants (producción)

Estructura acordada con el cliente: **6 tenants** (operadores) y **12 empresas** (razones sociales), con cupo de **licencias** (conductores contratados) en `companies.profile.licensedDrivers`.

| Tenant (slug) | Login slug | Admin (seed) | Empresas | Licencias |
|---------------|------------|--------------|----------|-----------|
| Noemí | `noemi` | `admin-noemi@fleethub.local` | Alquilauto | 20 |
| María | `maria` | `admin-maria@fleethub.local` | Jobroco, Jororo, Taxiflores | 35 + 7 + 5 |
| Cazcarra | `cazcarra` | `admin-cazcarra@fleethub.local` | Taxis Alseto, Taxis Pallas, Autotaxis Buil | 21 + 5 + 11 |
| Treviño | `trevino` | `admin-trevino@fleethub.local` | Taxi Business | 22 |
| Primo Treviño | `primo-trevino` | `admin-primo-trevino@fleethub.local` | Tradetaxis | 9 |
| Cosculluela | `cosculluela` | `admin-cosculluela@fleethub.local` | Badavi, Taxis Galera, Santacoloma taxi | 22 + 22 + 2 |

**Total:** 181 licencias · contraseña seed demo: `Demo1234!`

El tenant de demo **`demo-a`** (BADAVI SL con viajes de prueba) se mantiene aparte para smoke tests y reunión comercial.

## Seed

```bash
npm run seed -w @fleethub/db
```

Implementación: `packages/db/prisma/seed-production-tenants.ts`

## UI

- **Empresas** listado: columna **Licencias** (`activos / contratadas`) y resumen del tenant
- Ficha empresa: mismo dato en «Estado y plataformas»
- Sin cupo en `profile` → muestra «—» (p. ej. `demo-a` hasta definir cupo)

## Pendiente de producto

- Alta de conductores reales en tenants de producción
