#!/usr/bin/env node
/**
 * Replaces auto-generated English superAdmin labels with proper Spanish/Catalan.
 * Run: node packages/i18n/scripts/apply-super-admin-translations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../locales");

/** Map English placeholder → Spanish */
const ES_BY_VALUE = {
  "Access Email Hint": "Email del administrador (acceso)",
  "Access Label": "Acceso",
  "Active Company": "Empresa activa",
  "Admin Access Title": "Acceso administrador",
  "All Platforms": "Todas las plataformas",
  "Api Route Not Found": "Ruta API no encontrada",
  "Api Success Hint": "Porcentaje de llamadas API exitosas en 24 h",
  "Api Success Stats": "Estadísticas API (24 h)",
  "Applied Period": "Periodo aplicado",
  "Auto Poll Last Ok": "Último poll automático OK",
  "Auto Poll Stale Help": "Si no hay poll OK reciente, revisa el worker y Redis.",
  "Auto Poll Title": "Poll automático global",
  "By Source": "Por origen",
  "Closed Trips Free Now": "Viajes cerrados FreeNow",
  "Closed Trips Uber": "Viajes cerrados Uber",
  "Commercial Status Active": "Activo comercial",
  "Commercial Status Suspended": "Suspendido",
  "Commercial Status Trial": "Prueba",
  "Companies": "Empresas",
  "Company": "Empresa",
  "Connection Error": "Error de conexión",
  Contact: "Contacto",
  "Contact Email": "Email de contacto",
  Created: "Creados",
  "Create Failed": "Error al crear",
  "Create Help": "Datos del tenant y primer administrador.",
  "Create Operator": "Crear operador",
  "Create Submit": "Crear",
  "Create Success": "Creado correctamente.",
  "Create Success With Companies": "Tenant creado con empresas.",
  "Create Super Admin": "Crear Super Admin",
  Creating: "Creando…",
  "Date From Aria": "Fecha desde",
  "Date To Aria": "Fecha hasta",
  "Delete Company": "Eliminar empresa",
  "Delete Confirm": "¿Confirmar eliminación?",
  "Delete Failed": "Error al eliminar",
  "Delete Has Drivers": "No se puede eliminar: tiene conductores.",
  "Delete Success": "Eliminado correctamente.",
  Deleting: "Eliminando…",
  "Documents Download": "Descargar",
  "Documents Empty": "Sin documentos",
  "Documents Intro": "Documentación legal retenida tras baja.",
  "Documents Pending": "Pendiente",
  "Documents Purge": "Eliminar definitivamente",
  "Documents Purge Confirm": "¿Eliminar el documento de forma permanente?",
  "Documents Purge Failed": "No se pudo eliminar el documento",
  "Documents Purge Success": "Documento eliminado.",
  "Documents Purge Title": "Eliminar documento",
  "Documents Retired By Tenant": "Retirado por el tenant",
  "Documents Retired On": "Retirado el",
  "Documents Section": "Documentos",
  Drivers: "Conductores",
  "Drivers Associated": "Conductores asociados",
  "Drivers Block Deactivate": "Desactivar conductores antes de continuar.",
  "Drivers Block Delete": "Elimina o reasigna conductores antes de borrar.",
  "Drivers Free Now": "Conductores FreeNow",
  "Drivers Total": "Conductores totales",
  "Drivers Uber": "Conductores Uber",
  Duplicates: "Duplicados",
  "Duplicate Warning": "Posible duplicado detectado",
  "Edit Help": "Modifica datos del operador.",
  "Edit Intro": "Datos fiscales y contacto.",
  "Edit Operator Title": "Editar operador",
  "Edit Subtitle": "Modifica los datos",
  "Edit Super Admin": "Editar Super Admin",
  "Edit Tenant User": "Editar usuario tenant",
  "Edit Title": "Editar",
  "Empty Available": "Ninguno disponible",
  "Empty Db": "Sin registros en base de datos",
  "Empty None": "Ninguno",
  "Filter Platform Aria": "Filtrar por plataforma",
  "Filter Role Aria": "Filtrar por rol",
  "Filter Status Aria": "Filtrar por estado",
  "First Admin Section": "Primer administrador",
  "First Name": "Nombre",
  "First Name Placeholder": "Nombre",
  "Free Now With Activity": "FreeNow con actividad",
  Global: "Global",
  Impersonate: "Entrar como tenant",
  "Impersonate Confirm": "¿Entrar en el panel de este tenant?",
  "Impersonate Failed": "No se pudo impersonar",
  "Inactive Tag": "Inactivo",
  "Ingestion Empty": "Sin datos de ingesta",
  "Invalid Slug": "Identificador (slug) no válido",
  "Invalid Tenant": "Tenant no válido",
  "Last Name": "Apellidos",
  "Last Name Placeholder": "Apellidos",
  "Latency Hint": "Tiempo entre evento y persistencia",
  "Latency Title": "Latencia de ingesta",
  "Manager Label": "Gestor",
  "Manager Placeholder": "Nombre del gestor",
  "Minutes Ago": "hace {minutes} min",
  "New Password": "Nueva contraseña",
  "New Platform Help": "Usuario con acceso global a FleetHub.",
  "New Platform Title": "Nuevo Super Admin",
  "New Subtitle": "Alta en la plataforma",
  "New Title": "Nuevo",
  "No Companies": "Sin empresas",
  "No Filter Match": "Ningún resultado con este filtro",
  "No Operator Filter Match": "Ningún operador coincide",
  "No Record": "Sin registro",
  "No Search Results": "Sin resultados de búsqueda",
  "Not Configured": "No configurado",
  "No Tenants First": "Crea un tenant antes de añadir empresas.",
  Opening: "Abriendo…",
  Operator: "Operador",
  "Operator Data Title": "Datos del operador",
  "Operator Name Label": "Nombre del operador",
  "Operator Name Placeholder": "Nombre comercial",
  "Operator Select Label": "Operador (tenant)",
  "Password Leave Empty": "Dejar vacío para no cambiar",
  "Password Min Placeholder": "Mínimo 8 caracteres",
  Phone: "Teléfono",
  Plan: "Plan",
  Platforms: "Plataformas",
  "Platforms Uber And Free Now": "Uber y FreeNow",
  "Platform Subtitle": "Resumen de la plataforma",
  "Platform User Label": "Usuario de plataforma",
  "Poll Fallback": "Poll automático",
  "Production Badge": "Producción",
  "Registered At": "Registro",
  Resetting: "Restableciendo…",
  "Required Email": "El email es obligatorio",
  "Required Name": "El nombre es obligatorio",
  "Required Operator Name": "El nombre del operador es obligatorio",
  "Reset Password Alert": "Se enviará una contraseña temporal por email.",
  "Reset Password Confirm Custom": "¿Usar la contraseña indicada?",
  "Reset Password Confirm Generate": "¿Generar contraseña aleatoria?",
  "Reset Password Failed": "Error al restablecer contraseña",
  "Reset Password Prompt": "Introduce la nueva contraseña",
  "Reset Password Success": "Contraseña actualizada.",
  "Reset Password Title": "Restablecer contraseña",
  "Save Changes": "Guardar cambios",
  "Save Failed": "Error al guardar",
  "Save Operator": "Guardar operador",
  "Search Aria": "Buscar",
  "Search Placeholder": "Buscar…",
  "Select Company": "Seleccionar empresa",
  Self: "Propio",
  "Server Connection Error": "Error de conexión con el servidor",
  "Showing Companies": "Mostrando {count} empresas",
  "Showing Filtered": "Mostrando {count} filtrados",
  "Showing Operators": "Mostrando {count} operadores",
  "Showing Users": "Mostrando {count} usuarios",
  Subtitle: "Gestión global",
  "Summary Intro": "Resumen del periodo",
  "Tax Id": "NIF/CIF",
  "Tenant Label": "Tenant",
  "Tenants Active": "Tenants activos",
  "Tenants Total": "Tenants totales",
  Title: "Título",
  "Totp Active Title": "2FA activo",
  "Totp Recovery Help": "Códigos de respaldo para recuperación.",
  "Totp Section": "Autenticación en dos pasos",
  "Totp Status": "Estado 2FA",
  "Trial Ends Label": "Fin de prueba",
  "Uber With Activity": "Uber con actividad",
  Unassigned: "Sin asignar",
  Updated: "Actualizados",
  "Update Failed": "Error al actualizar",
  "Update Success": "Actualizado correctamente.",
  User: "Usuario",
  "User Active": "Usuario activo",
  "Users Active": "Usuarios activos",
  "Users Total": "Usuarios totales",
  "View Operator": "Ver operador",
  "View Operators": "Ver operadores",
  Webhooks: "Webhooks",
  "Webhook Vs Poll": "Webhooks vs poll",
  "Webhook Zero Hint": "Sin webhooks — ingesta por poll.",
  "All Companies": "Todas las empresas",
  "All Tenants": "Todos los tenants",
  "Add Company Section": "Añadir empresa",
  "Add Company Submit": "Añadir empresa",
  "Admin Email Hint": "Email del administrador del tenant",
  "Admin Email Label": "Email administrador",
  "Admin Email Required": "Email del administrador obligatorio",
  "Admin Email Required Toast": "Indica el email del administrador",
  "Admin Password Required": "Contraseña del administrador obligatoria",
  "Commercial Status Label": "Estado comercial",
  "Companies Panel Help": "Empresas fiscales vinculadas a este tenant.",
  "Companies Panel Title": "Empresas del tenant",
  "Company Added": "Empresa añadida",
  "Remove Section": "Zona de peligro",
};

function caFromEs(es) {
  return es
    .replace(/ación/g, "ació")
    .replace(/cciones/g, "ccions")
    .replace(/Guardar/g, "Desar")
    .replace(/Buscar/g, "Cercar")
    .replace(/Eliminar/g, "Eliminar")
    .replace(/Usuarios/g, "Usuaris")
    .replace(/Empresas/g, "Empreses")
    .replace(/Nombre/g, "Nom")
    .replace(/Apellidos/g, "Cognoms")
    .replace(/Contraseña/g, "Contrasenya")
    .replace(/Operador/g, "Operador")
    .replace(/Desde/g, "Des de")
    .replace(/Hasta/g, "Fins a")
    .replace(/Ningún/g, "Cap")
    .replace(/Ninguno/g, "Cap")
    .replace(/Editar/g, "Editar")
    .replace(/Creando/g, "Creant")
    .replace(/Eliminando/g, "Eliminant");
}

function walkReplace(obj, locale) {
  if (typeof obj !== "object" || obj === null) return;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const es = ES_BY_VALUE[value];
      if (es) {
        obj[key] = locale === "ca" ? caFromEs(es) : es;
      }
    } else {
      walkReplace(value, locale);
    }
  }
}

function setPath(obj, parts, value) {
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in node)) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

for (const locale of ["es", "ca"]) {
  const file = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  walkReplace(data.superAdmin, locale);
  // New sync health keys
  setPath(data.superAdmin, ["sync", "runningMinutes"], locale === "ca" ? "{minutes} min en curs" : "{minutes} min en curso");
  setPath(data.superAdmin, ["sync", "runningStale"], locale === "ca" ? "bloquejat" : "bloqueada");
  setPath(data.superAdmin, ["sync", "runningColumn"], locale === "ca" ? "En curs" : "En curso");
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`Updated ${locale}.json`);
}
