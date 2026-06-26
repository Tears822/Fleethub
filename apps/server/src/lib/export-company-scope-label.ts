import {
  companyScopeLabelForSession,
  resolveCompanyScopeWithCookie,
} from "@fleethub/auth/company-scope-cookie";
import type { AppSession } from "@fleethub/auth";

/** Shell company selector + user scope (Cerrar turnos table ↔ detalle API). */
export async function resolveCompanyScopeWithCookieForRequest(
  session: AppSession & { kind: "tenant"; tid: string },
  cookieHeader?: string,
) {
  return resolveCompanyScopeWithCookie(session, { cookieHeader });
}

/** Etiqueta de empresa para cabeceras de export (selector shell + scope usuario). */
export async function exportCompanyScopeLabel(
  session: AppSession & { kind: "tenant"; tid: string },
  cookieHeader?: string,
): Promise<string> {
  return companyScopeLabelForSession(session, { cookieHeader });
}
