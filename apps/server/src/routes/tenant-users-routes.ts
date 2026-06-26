import type { FastifyInstance, FastifyReply } from "fastify";
import {
  deleteTenantUser,
  inviteTenantUser,
  resendTenantUserInvite,
  updateTenantUser,
} from "@fleethub/auth";
import { httpStatusForRbacError, requireAdminTenant } from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function handleRbacError(reply: FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  return reply.status(httpStatusForRbacError(code)).send({
    error: code === "FORBIDDEN" ? "No autorizado para esta acción." : "No autorizado.",
  });
}

export async function registerTenantUsersRoutes(app: FastifyInstance) {
  app.post("/api/tenant/users/invite", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const result = await inviteTenantUser(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/users/:userId/resend-invite", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { userId } = request.params as { userId: string };
      const result = await resendTenantUserInvite(session, userId);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/users/:userId", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { userId } = request.params as { userId: string };
      const result = await updateTenantUser(session, userId, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.delete("/api/tenant/users/:userId", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { userId } = request.params as { userId: string };
      const result = await deleteTenantUser(session, userId);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });
}
