import type { FastifyInstance } from "fastify";
import { parseSyncRunCursorHint, parseSyncTrigger } from "@fleethub/auth";
import { canManageShifts } from "@fleethub/auth/rbac";
import { withTenant } from "@fleethub/db";
import {
  enqueuePlatformSyncJobs,
  platformSyncLabel,
  resolveSyncPlatforms,
} from "../lib/fleet-sync-queue.js";
import { readSession } from "../lib/session.js";

export async function registerTenantSyncRoutes(app: FastifyInstance) {
  app.get("/api/tenant/sync/runs", async (request, reply) => {
    const session = await readSession(request);
    if (!session) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    if (session.kind !== "tenant" || !session.tid) {
      return reply.status(403).send({ error: "No autorizado." });
    }
    const tenantId = session.tid;

    const q = request.query as { limit?: string };
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));

    const runs = await withTenant(tenantId, (tx) =>
      tx.syncRun.findMany({
        where: { tenantId },
        orderBy: { startedAt: "desc" },
        take: limit,
        select: {
          id: true,
          platform: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true,
          cursorHint: true,
        },
      }),
    );

    return reply.send({
      runs: runs.map((r) => {
        const hint = parseSyncRunCursorHint(r.cursorHint);
        return {
          id: r.id,
          platform: r.platform,
          status: r.status,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt?.toISOString() ?? null,
          errorMessage: r.errorMessage,
          trigger: hint.trigger ?? parseSyncTrigger(r.cursorHint),
          ingestSource: hint.ingestSource ?? null,
          tripsUpserted: hint.tripsUpserted ?? null,
          ingestCollisions: hint.ingestCollisions ?? null,
          tripsMissingAmounts: hint.tripsMissingAmounts ?? null,
          tripsWithAmounts: hint.tripsWithAmounts ?? null,
          paymentsComplete: hint.paymentsComplete ?? null,
        };
      }),
    });
  });

  app.post("/api/tenant/sync/poll", async (request, reply) => {
    const session = await readSession(request);
    if (!session) {
      return reply.status(401).send({ error: "No autorizado." });
    }
    if (session.kind !== "tenant" || !session.tid) {
      return reply.status(403).send({ error: "No autorizado." });
    }
    if (session.impersonating) {
      return reply.status(403).send({
        error: "Vista Super Admin (solo lectura): no puedes solicitar sincronización.",
      });
    }
    if (!canManageShifts(session.role)) {
      return reply.status(403).send({
        error: "Solo administradores y gestores pueden actualizar datos manualmente.",
      });
    }

    try {
      const body = (request.body ?? {}) as { platform?: string; all?: boolean };
      const platforms = resolveSyncPlatforms({
        platform: body.platform,
        all: body.all === true,
      });
      const jobIds = await enqueuePlatformSyncJobs(session.tid, platforms);
      return reply.send({
        ok: true,
        enqueued: jobIds.length,
        platforms,
        message: `Sincronización manual en cola (${platformSyncLabel(platforms)}).`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de sincronización";
      if (message.includes("REDIS_URL")) {
        return reply.status(503).send({
          ok: false,
          queueUnavailable: true,
          error: "Cola de sincronización no disponible. Se actualizará solo el panel.",
        });
      }
      request.log.error({ err }, "tenant sync poll failed");
      return reply.status(500).send({ error: "No se pudo encolar la sincronización." });
    }
  });
}
