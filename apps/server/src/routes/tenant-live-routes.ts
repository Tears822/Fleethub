import type { FastifyInstance } from "fastify";
import { refreshTodayDriverPlatformMetrics } from "@fleethub/auth";
import { canManageShifts } from "@fleethub/auth/rbac";
import { resolveCompanyScopeForSession } from "@fleethub/auth/tenant-scope";
import { refreshDriverConnectionsForTenant } from "@fleethub/worker/live";
import { readSession } from "../lib/session.js";

export async function registerTenantLiveRoutes(app: FastifyInstance) {
  app.post("/api/tenant/live/refresh-connections", async (request, reply) => {
    const session = await readSession(request);
    if (!session) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    if (session.kind !== "tenant" || !session.tid) {
      return reply.status(403).send({ error: "No autorizado." });
    }
    if (session.impersonating) {
      return reply.status(403).send({
        error: "Vista Super Admin (solo lectura): no puedes actualizar conexiones en vivo.",
      });
    }

    try {
      const result = await refreshDriverConnectionsForTenant(session.tid, { force: true });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      request.log.warn({ err }, "refresh-connections failed");
      return reply.status(503).send({
        ok: false,
        error: "No se pudo consultar el estado en plataforma (revisa credenciales Uber/FreeNow).",
      });
    }
  });

  app.post("/api/tenant/live/refresh-day-metrics", async (request, reply) => {
    const session = await readSession(request);
    if (!session) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    if (session.kind !== "tenant" || !session.tid) {
      return reply.status(403).send({ error: "No autorizado." });
    }
    if (session.impersonating) {
      return reply.status(403).send({
        error: "Vista Super Admin (solo lectura): no puedes actualizar métricas del día.",
      });
    }
    if (!canManageShifts(session.role)) {
      return reply.status(403).send({ error: "Sin permiso para actualizar métricas." });
    }

    const scope = await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: session.tid,
    });

    const result = await refreshTodayDriverPlatformMetrics(session.tid, scope);
    return reply.send({ ok: true, buckets: result.buckets });
  });
}
