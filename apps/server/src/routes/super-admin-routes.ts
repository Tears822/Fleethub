import type { FastifyInstance } from "fastify";
import {
  FH_PLATFORM_SESSION_COOKIE,
  FH_SESSION_COOKIE,
  endTenantImpersonation,
  revertShiftClose,
  startTenantImpersonation,
  verifySessionToken,
} from "@fleethub/auth";
import { requirePlatformSession } from "../lib/platform-session.js";
import {
  buildPlatformSessionClearCookieHeader,
  buildPlatformSessionSetCookieHeader,
  buildSessionSetCookieHeader,
  sessionCookieEnv,
} from "@fleethub/auth/cookie";
import { SESSION_MAX_AGE_SECONDS } from "@fleethub/auth";
import { readSession } from "../lib/session.js";
import { buildSuperAdminCompaniesXlsx } from "../lib/super-admin-companies-export.js";
import { buildSuperAdminTenantsXlsx } from "../lib/super-admin-tenants-export.js";
import { buildSuperAdminUsersXlsx } from "../lib/super-admin-users-export.js";
import {
  purgeOrphanFleetSyncJobs,
  superAdminForceTenantSync,
  superAdminReconcileStaleSyncs,
  superAdminRetryFailedFleetSyncJobs,
} from "../lib/super-admin-sync-actions.js";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

export async function registerSuperAdminRoutes(app: FastifyInstance) {
  const cookieOpts = () => ({ ...sessionCookieEnv(), maxAge: SESSION_MAX_AGE_SECONDS });

  app.post("/api/super-admin/impersonate/:tenantId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }

    const { tenantId } = request.params as { tenantId: string };
    const currentToken = parseCookie(request.headers.cookie, FH_SESSION_COOKIE);
    if (!currentToken) {
      return reply.status(401).send({ error: "Sesión no encontrada." });
    }

    const result = await startTenantImpersonation(session, tenantId);
    if (!result.ok) {
      return reply.status(400).send({ error: result.error.message });
    }

    const opts = cookieOpts();
    reply.header("Set-Cookie", [
      buildPlatformSessionSetCookieHeader(currentToken, opts),
      buildSessionSetCookieHeader(result.value.tenantToken, opts),
    ]);

    return reply.send({
      ok: true,
      redirectTo: result.value.redirectTo,
      tenantSlug: result.value.tenantSlug,
    });
  });

  app.post("/api/super-admin/impersonate/end", async (request, reply) => {
    const impersonation = await readSession(request);
    if (!impersonation?.impersonating) {
      return reply.status(400).send({ error: "No hay una sesión de impersonación activa." });
    }

    const platformToken = parseCookie(request.headers.cookie, FH_PLATFORM_SESSION_COOKIE);
    if (!platformToken) {
      return reply.status(400).send({ error: "Sesión de plataforma no encontrada." });
    }

    const platformSession = await verifySessionToken(platformToken);
    if (!platformSession || platformSession.kind !== "platform") {
      return reply.status(400).send({ error: "Sesión de plataforma no válida." });
    }

    const result = await endTenantImpersonation(platformSession);
    if (!result.ok) {
      return reply.status(400).send({ error: result.error.message });
    }

    const opts = cookieOpts();
    reply.header("Set-Cookie", [
      buildSessionSetCookieHeader(result.value.platformToken, opts),
      buildPlatformSessionClearCookieHeader(opts),
    ]);

    return reply.send({
      ok: true,
      redirectTo: result.value.redirectTo,
    });
  });

  app.get("/api/super-admin/export/tenants.xlsx", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const buffer = await buildSuperAdminTenantsXlsx();
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      reply.header(
        "Content-Disposition",
        `attachment; filename="FleetHub_tenants_generado${date}.xlsx"`,
      );
      return reply.send(buffer);
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      const status = code === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(status).send({
        error: status === 401 ? "No autorizado." : "No se pudo exportar.",
      });
    }
  });

  app.get("/api/super-admin/export/usuarios.xlsx", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const buffer = await buildSuperAdminUsersXlsx();
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      reply.header(
        "Content-Disposition",
        `attachment; filename="FleetHub_usuarios_generado${date}.xlsx"`,
      );
      return reply.send(buffer);
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      const status = code === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(status).send({
        error: status === 401 ? "No autorizado." : "No se pudo exportar.",
      });
    }
  });

  app.get("/api/super-admin/export/empresas.xlsx", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const buffer = await buildSuperAdminCompaniesXlsx();
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      reply.header(
        "Content-Disposition",
        `attachment; filename="FleetHub_empresas_generado${date}.xlsx"`,
      );
      return reply.send(buffer);
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      const status = code === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(status).send({
        error: status === 401 ? "No autorizado." : "No se pudo exportar.",
      });
    }
  });

  app.post("/api/super-admin/tenants/:tenantId/shifts/revert-close", async (request, reply) => {
    try {
      const platformSession = await requirePlatformSession(request);
      const { tenantId } = request.params as { tenantId: string };
      const result = await revertShiftClose(platformSession, tenantId, request.body);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error.message });
      }
      return reply.send(result.value);
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      const status = code === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(status).send({
        error: status === 401 ? "No autorizado." : "Error al revertir el cierre.",
      });
    }
  });

  app.post("/api/super-admin/tenants/:tenantId/sync", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const { tenantId } = request.params as { tenantId: string };
      const body = (request.body ?? {}) as { platform?: string; all?: boolean };
      const result = await superAdminForceTenantSync(tenantId, body);
      return reply.send({
        ok: true,
        enqueued: result.jobIds.length,
        platforms: result.platforms,
        reconciled: result.reconciled,
        message: `Sincronización encolada para ${result.platforms.join(", ")}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de sincronización";
      if (message.includes("REDIS_URL")) {
        return reply.status(503).send({
          ok: false,
          queueUnavailable: true,
          error: "Cola de sincronización no disponible.",
        });
      }
      request.log.error({ err }, "super-admin force sync failed");
      const code = err instanceof Error && err.message === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(code).send({
        error: code === 401 ? "No autorizado." : "No se pudo encolar la sincronización.",
      });
    }
  });

  app.post("/api/super-admin/sync/reconcile-stale", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const body = (request.body ?? {}) as { tenantId?: string; platform?: string };
      const platform =
        typeof body.platform === "string" && body.platform.trim()
          ? (body.platform.trim().toUpperCase() as "UBER" | "FREENOW")
          : undefined;
      const result = await superAdminReconcileStaleSyncs({
        tenantId: body.tenantId,
        platform,
      });
      const orphans = await purgeOrphanFleetSyncJobs(200);
      return reply.send({ ok: true, ...result, orphansRemoved: orphans });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      if (message.includes("REDIS_URL")) {
        return reply.status(503).send({ ok: false, error: "Cola de sincronización no disponible." });
      }
      const code = message === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(code).send({
        error: code === 401 ? "No autorizado." : "No se pudo reconciliar sync bloqueadas.",
      });
    }
  });

  app.post("/api/super-admin/sync/retry-failed", async (request, reply) => {
    try {
      await requirePlatformSession(request);
      const body = (request.body ?? {}) as { limit?: number };
      const retried = await superAdminRetryFailedFleetSyncJobs(body.limit ?? 50);
      return reply.send({ ok: true, retried });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      if (message.includes("REDIS_URL")) {
        return reply.status(503).send({ ok: false, error: "Cola de sincronización no disponible." });
      }
      const code = message === "UNAUTHORIZED" ? 401 : 500;
      return reply.status(code).send({
        error: code === 401 ? "No autorizado." : "No se pudieron reintentar jobs fallidos.",
      });
    }
  });
}
