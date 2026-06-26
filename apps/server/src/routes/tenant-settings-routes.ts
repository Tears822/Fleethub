import type { FastifyInstance } from "fastify";
import {
  getTenantAnalyticsSettings,
  getTenantGeneralSettings,
  getTenantIntegrationSettings,
  integrationSettingsForSession,
  getTenantProductivityThresholds,
  updateTenantAnalyticsSettings,
  updateTenantGeneralSettings,
  updateTenantIntegrationSettings,
  updateTenantProductivityThresholds,
} from "@fleethub/auth";
import { httpStatusForRbacError, requireTenantSession } from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function handleRbacError(reply: import("fastify").FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  return reply.status(httpStatusForRbacError(code)).send({
    error: code === "FORBIDDEN" ? "No autorizado para esta acción." : "No autorizado.",
  });
}

export async function registerTenantSettingsRoutes(app: FastifyInstance) {
  app.get("/api/tenant/settings/general", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const general = await getTenantGeneralSettings(session.tid);
      const integrations = integrationSettingsForSession(
        session,
        await getTenantIntegrationSettings(session.tid),
      );
      if (!general) return reply.status(404).send({ error: "Tenant no encontrado." });
      return reply.send({ ...general, integrations });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/settings/general", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const result = await updateTenantGeneralSettings(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      const integrations = integrationSettingsForSession(
        session,
        await getTenantIntegrationSettings(session.tid),
      );
      return reply.send({ ...result.value, integrations });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/settings/productivity", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "tenant" || !session.tid) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const thresholds = await getTenantProductivityThresholds(session.tid);
    return reply.send(thresholds);
  });

  app.get("/api/tenant/settings/integrations", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const integrations = integrationSettingsForSession(
        session,
        await getTenantIntegrationSettings(session.tid),
      );
      return reply.send(integrations);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/settings/integrations", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const result = await updateTenantIntegrationSettings(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(integrationSettingsForSession(session, result.value));
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/settings/productivity", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "tenant" || !session.tid) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const result = await updateTenantProductivityThresholds(session, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.get("/api/tenant/settings/analytics", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "tenant" || !session.tid) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const analytics = await getTenantAnalyticsSettings(session.tid);
    return reply.send(analytics);
  });

  app.patch("/api/tenant/settings/analytics", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "tenant" || !session.tid) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const result = await updateTenantAnalyticsSettings(session, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });
}
