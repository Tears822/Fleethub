import type { FastifyInstance } from "fastify";
import {
  isSmtpConfigured,
  sendTenantAlertDigest,
  getTenantNotificationSettings,
  updateTenantNotificationSettings,
} from "@fleethub/auth";
import { withTenantRls } from "@fleethub/db";
import { httpStatusForRbacError, requireTenantSession } from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function handleRbacError(reply: import("fastify").FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  return reply.status(httpStatusForRbacError(code)).send({
    error: code === "FORBIDDEN" ? "No autorizado para esta acción." : "No autorizado.",
  });
}

export async function registerTenantNotificationsRoutes(app: FastifyInstance) {
  app.get("/api/tenant/notifications/status", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const settings = await getTenantNotificationSettings(session.tid);
      return reply.send({
        smtpConfigured: isSmtpConfigured(),
        settings,
      });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/settings/notifications", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const result = await updateTenantNotificationSettings(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({
        smtpConfigured: isSmtpConfigured(),
        settings: result.value,
      });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/notifications/send-digest", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const body = request.body as { alerts?: { id: string; title: string; description: string }[] };
      if (!Array.isArray(body?.alerts) || body.alerts.length === 0) {
        return reply.status(400).send({ error: "No hay alertas para enviar." });
      }

      const tenantId = session.tid;
      const tenant = await withTenantRls(tenantId, (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        }),
      );
      if (!tenant) return reply.status(404).send({ error: "Tenant no encontrado." });

      const result = await sendTenantAlertDigest(tenantId, tenant.name, body.alerts);
      if (result.skipped) {
        return reply.status(400).send({ error: result.reason ?? "No se envió el email." });
      }
      return reply.send({ ok: true, sent: result.sent });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });
}
