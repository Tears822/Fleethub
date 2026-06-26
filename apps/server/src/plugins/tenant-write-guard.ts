import type { FastifyInstance } from "fastify";
import {
  canExportTenantData,
  isTenantCompaniesAdminApiPath,
  isTenantNotificationsAdminApiPath,
  isTenantSettingsAdminApiPath,
  isTenantShiftLiquidationExportPostPath,
  isTenantUsersAdminApiPath,
} from "@fleethub/auth/rbac";
import { TenantRole } from "@fleethub/db";
import { readSession } from "../lib/session.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function registerTenantWriteGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (READ_METHODS.has(request.method)) return;

    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/tenant/")) return;

    const session = await readSession(request);
    if (!session) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    if (session.kind !== "tenant") {
      return reply.status(403).send({ error: "No autorizado." });
    }

    if (isTenantShiftLiquidationExportPostPath(path)) {
      if (!canExportTenantData(session.role)) {
        return reply.status(403).send({ error: "No autorizado para esta acción." });
      }
      return;
    }

    if (session.impersonating) {
      return reply.status(403).send({
        error: "Vista Super Admin (solo lectura): no puedes modificar datos.",
      });
    }
    if (session.role === TenantRole.SOLO_LECTURA) {
      return reply.status(403).send({
        error: "Modo solo lectura: no puedes modificar datos.",
      });
    }
    if (
      isTenantUsersAdminApiPath(path) &&
      session.role !== TenantRole.ADMIN_TENANT
    ) {
      return reply.status(403).send({
        error: "Solo el administrador del tenant puede gestionar usuarios.",
      });
    }
    if (
      isTenantCompaniesAdminApiPath(path) &&
      session.role !== TenantRole.ADMIN_TENANT
    ) {
      return reply.status(403).send({
        error: "Solo el administrador del tenant puede gestionar empresas.",
      });
    }
    if (
      isTenantSettingsAdminApiPath(path) &&
      session.role !== TenantRole.ADMIN_TENANT
    ) {
      return reply.status(403).send({
        error: "Solo el administrador del tenant puede cambiar la configuración.",
      });
    }
    if (
      isTenantNotificationsAdminApiPath(path) &&
      session.role !== TenantRole.ADMIN_TENANT
    ) {
      return reply.status(403).send({
        error: "Solo el administrador del tenant puede gestionar notificaciones.",
      });
    }
  });
}
