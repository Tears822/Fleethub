# FleetHub — Traducción (i18n)

Archivos para traducir la interfaz de FleetHub a catalán (y futuros idiomas).

## Archivos para el cliente / traductor

| Archivo | Uso |
|---------|-----|
| `FleetHub-strings-es-ca.csv` | Hoja de cálculo: columnas **key**, **es** (origen), **ca** (catalán), **notes** |
| `es.json` | Catálogo español (fuente) |
| `ca.json` | Catálogo catalán (destino) |

Regenerar tras cambios en código:

```bash
npm run export:csv -w @fleethub/i18n
```

## Ubicación en el repo (desarrollo)

Los catálogos activos de la aplicación están en:

- `packages/i18n/locales/es.json`
- `packages/i18n/locales/ca.json`

## Idioma en la app

Cada tenant elige idioma en **Configuración → Datos generales → Idioma** (`es` o `ca`).

La cobertura actual traduce:

- Menú lateral y cabecera
- Ajustes / configuración general
- Textos comunes (guardar, cancelar, etc.)

Muchas pantallas operativas (cerrar torns, detalle de viajes, etc.) siguen en español hasta ampliar el catálogo.

## Añadir nuevas cadenas

1. Añade la clave en `packages/i18n/locales/es.json`
2. Añade la traducción en `packages/i18n/locales/ca.json`
3. Usa en UI: `t("nav.dashboard")` o `t("config.general.saved")`
4. Regenera el CSV para el traductor

## Claves con parámetros

Ejemplo en JSON:

```json
"tenantNameReadonlyHint": "El identificador interno del tenant es {slug}."
```

En código:

```ts
t("config.general.tenantNameReadonlyHint", { slug: "trevino" })
```
