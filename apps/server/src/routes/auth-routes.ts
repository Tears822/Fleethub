import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  authenticateLogin,
  complete2faLogin,
  confirmPasswordReset,
  requestPasswordReset,
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  getTotpStatus,
  activateInvitedUser,
  isPublicSignupEnabled,
  registerPublicTenant,
  resendEmailVerification,
  verifyEmailWithToken,
  changeAccountPassword,
  createPlatformUser,
  createCompanyForSuperAdmin,
  deleteCompanyForSuperAdmin,
  listCompanyDocumentsForSuperAdmin,
  purgeCompanyDocumentForSuperAdmin,
  readRetainedCompanyDocument,
  updateCompanyForSuperAdmin,
  createTenantWithAdmin,
  deletePlatformUserForSuperAdmin,
  deleteTenantForSuperAdmin,
  deleteTenantUserForSuperAdmin,
  updateAccountProfile,
  updateAccountLocale,
  updatePlatformUserForSuperAdmin,
  updateTenantForSuperAdmin,
  updateTenantUserForSuperAdmin,
  resetTotpForSuperAdmin,
  resetPasswordForSuperAdmin,
  isLoginRequires2fa,
  signSessionToken,
  accountDisplayName,
} from "@fleethub/auth";
import {
  buildPlatformSessionClearCookieHeader,
  buildSessionClearCookieHeader,
  buildSessionSetCookieHeader,
  sessionCookieEnv,
} from "@fleethub/auth/cookie";
import {
  buildGuestLocaleSetCookieHeader,
  guestLocaleCookieEnv,
} from "@fleethub/auth/guest-locale-cookie";
import { parseUserLocaleInput } from "@fleethub/auth/user-locale";
import { SESSION_MAX_AGE_SECONDS } from "@fleethub/auth";
import { clientIp, readSession } from "../lib/session.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  const cookieOpts = () => ({ ...sessionCookieEnv(), maxAge: SESSION_MAX_AGE_SECONDS });

  app.post("/api/auth/login", async (request, reply) => {
    const result = await authenticateLogin(request.body, clientIp(request));
    if (!result.ok) {
      const status =
        result.error.reason === "invalid_body"
          ? 400
          : result.error.reason === "locked"
            ? 429
            : result.error.reason === "email_not_verified" ||
                result.error.reason === "pending_activation"
              ? 403
              : 401;
      return reply.status(status).send({
        error: result.error.message,
        reason: result.error.reason,
      });
    }

    if (isLoginRequires2fa(result.value)) {
      return reply.send(result.value);
    }

    reply.header("Set-Cookie", buildSessionSetCookieHeader(result.value.token, cookieOpts()));
    return reply.send({
      ok: true,
      kind: result.value.kind,
      role: result.value.role,
      redirectTo: result.value.redirectTo,
      tenant: result.value.tenantSlug,
      requiresMfaSetup: result.value.requiresMfaSetup,
    });
  });

  app.post("/api/auth/login/2fa", async (request, reply) => {
    const result = await complete2faLogin(request.body, clientIp(request));
    if (!result.ok) {
      return reply.status(401).send({ error: result.error.message });
    }
    reply.header("Set-Cookie", buildSessionSetCookieHeader(result.value.token, cookieOpts()));
    return reply.send({
      ok: true,
      kind: result.value.kind,
      role: result.value.role,
      redirectTo: result.value.redirectTo,
      tenant: result.value.tenantSlug,
    });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    const opts = cookieOpts();
    reply.header("Set-Cookie", [
      buildSessionClearCookieHeader(opts),
      buildPlatformSessionClearCookieHeader(opts),
    ]);
    return reply.send({ ok: true });
  });

  app.post("/api/auth/forgot-password", async (request, reply) => {
    const result = await requestPasswordReset(request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/reset-password", async (request, reply) => {
    const result = await confirmPasswordReset(request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/activate", async (request, reply) => {
    const result = await activateInvitedUser(request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/signup/enabled", async (_request, reply) => {
    return reply.send({ enabled: isPublicSignupEnabled() });
  });

  app.post("/api/auth/signup", async (request, reply) => {
    const result = await registerPublicTenant(request.body);
    if (!result.ok) {
      const status =
        result.error.code === "disabled" ? 503 : result.error.code === "conflict" ? 409 : 400;
      return reply.status(status).send({ error: result.error.message });
    }
    return reply.status(201).send(result.value);
  });

  app.post("/api/auth/verify-email", async (request, reply) => {
    const result = await verifyEmailWithToken(request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/auth/resend-verification", async (request, reply) => {
    const result = await resendEmailVerification(request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/totp/status", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    const result = await getTotpStatus(session);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/auth/totp/begin", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    const result = await beginTotpSetup(session);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.patch("/api/auth/profile", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    try {
      const result = await updateAccountProfile(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      const name = accountDisplayName(
        {
          firstName: result.value.firstName?.trim() ?? "",
          lastName: result.value.lastName?.trim() ?? "",
        },
        session.email,
      );
      const token = await signSessionToken({ ...session, name });
      reply.header("Set-Cookie", buildSessionSetCookieHeader(token, cookieOpts()));
      return reply.send(result.value);
    } catch (error) {
      request.log.error({ err: error }, "profile update failed");
      return reply.status(500).send({ error: "No se pudieron guardar los datos." });
    }
  });

  app.patch("/api/auth/locale", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    try {
      const result = await updateAccountLocale(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      reply.header(
        "Set-Cookie",
        buildGuestLocaleSetCookieHeader(result.value.locale, guestLocaleCookieEnv()),
      );
      return reply.send(result.value);
    } catch (error) {
      request.log.error({ err: error }, "locale update failed");
      return reply.status(500).send({ error: "No se pudo guardar el idioma." });
    }
  });

  app.patch("/api/auth/guest-locale", async (request, reply) => {
    const localeRaw =
      typeof request.body === "object" && request.body !== null && "locale" in request.body
        ? String((request.body as { locale: string }).locale)
        : "";
    const locale = parseUserLocaleInput(localeRaw);
    if (!locale) return reply.status(400).send({ error: "Idioma no válido." });
    reply.header("Set-Cookie", buildGuestLocaleSetCookieHeader(locale, guestLocaleCookieEnv()));
    return reply.send({ locale });
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    try {
      const result = await changeAccountPassword(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (error) {
      request.log.error({ err: error }, "password change failed");
      return reply.status(500).send({ error: "No se pudo actualizar la contraseña." });
    }
  });

  app.post("/api/auth/totp/confirm", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    const code =
      typeof request.body === "object" && request.body !== null && "code" in request.body
        ? String((request.body as { code: string }).code)
        : "";
    const result = await confirmTotpSetup(session, code);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/auth/totp/disable", async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.status(401).send({ error: "No autorizado." });
    const code =
      typeof request.body === "object" && request.body !== null && "code" in request.body
        ? String((request.body as { code: string }).code)
        : "";
    const result = await disableTotp(session, code);
    if (!result.ok) {
      const status = result.error.message.includes("producción") ? 403 : 400;
      return reply.status(status).send({ error: result.error.message });
    }
    return reply.send(result.value);
  });

  app.post("/api/super-admin/tenants", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const result = await createTenantWithAdmin(session, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/platform-users", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const result = await createPlatformUser(session, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.patch("/api/super-admin/platform-users/:userId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const result = await updatePlatformUserForSuperAdmin(session, userId, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.patch("/api/super-admin/tenant-users/:userId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const body = request.body as { tenantId?: string };
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const result = await updateTenantUserForSuperAdmin(session, tenantId, userId, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/platform-users/:userId/reset-2fa", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const result = await resetTotpForSuperAdmin(session, {
      kind: "platform",
      userId,
    });
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/tenant-users/:userId/reset-2fa", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const body = request.body as { tenantId?: string };
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const result = await resetTotpForSuperAdmin(session, {
      kind: "tenant",
      userId,
      tenantId,
    });
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/platform-users/:userId/reset-password", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const body = request.body as { password?: string };
    const result = await resetPasswordForSuperAdmin(session, { kind: "platform", userId }, body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/tenant-users/:userId/reset-password", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const body = request.body as { tenantId?: string; password?: string };
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const result = await resetPasswordForSuperAdmin(
      session,
      { kind: "tenant", userId, tenantId },
      body,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.patch("/api/super-admin/tenants/:tenantId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { tenantId } = request.params as { tenantId: string };
    const result = await updateTenantForSuperAdmin(session, tenantId, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/tenants/:tenantId/companies", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { tenantId } = request.params as { tenantId: string };
    const result = await createCompanyForSuperAdmin(session, tenantId, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.get("/api/super-admin/companies/:companyId/documents", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { companyId } = request.params as { companyId: string };
    const result = await listCompanyDocumentsForSuperAdmin(companyId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send({ documents: result.value.documents });
  });

  app.get(
    "/api/super-admin/companies/:companyId/documents/:docId/retained",
    async (request, reply) => {
      const session = await readSession(request);
      if (!session || session.kind !== "platform") {
        return reply.status(401).send({ error: "No autorizado." });
      }
      const { companyId, docId } = request.params as { companyId: string; docId: string };
      const result = await readRetainedCompanyDocument(companyId, docId);
      if (!result.ok) return reply.status(404).send({ error: result.error.message });
      reply
        .header(
          "Content-Disposition",
          `inline; filename="${result.value.fileName.replace(/[^\w.\-()+ ]+/g, "_")}"`,
        )
        .type("application/pdf")
        .send(result.value.buffer);
    },
  );

  app.post(
    "/api/super-admin/companies/:companyId/documents/:docId/purge",
    async (request, reply) => {
      const session = await readSession(request);
      if (!session || session.kind !== "platform") {
        return reply.status(401).send({ error: "No autorizado." });
      }
      const { companyId, docId } = request.params as { companyId: string; docId: string };
      const result = await purgeCompanyDocumentForSuperAdmin(session, companyId, docId);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true, documents: result.value.documents });
    },
  );

  app.patch("/api/super-admin/companies/:companyId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { companyId } = request.params as { companyId: string };
    const result = await updateCompanyForSuperAdmin(session, companyId, request.body);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.delete("/api/super-admin/companies/:companyId", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { companyId } = request.params as { companyId: string };
    const result = await deleteCompanyForSuperAdmin(session, companyId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  app.post("/api/super-admin/companies/:companyId/delete", async (request, reply) => {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { companyId } = request.params as { companyId: string };
    const result = await deleteCompanyForSuperAdmin(session, companyId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  });

  async function handleDeleteTenant(request: FastifyRequest, reply: FastifyReply) {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { tenantId } = request.params as { tenantId: string };
    const result = await deleteTenantForSuperAdmin(session, tenantId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  }

  app.delete("/api/super-admin/tenants/:tenantId", handleDeleteTenant);
  app.post("/api/super-admin/tenants/:tenantId/delete", handleDeleteTenant);

  async function handleDeletePlatformUser(request: FastifyRequest, reply: FastifyReply) {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const result = await deletePlatformUserForSuperAdmin(session, userId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  }

  app.delete("/api/super-admin/platform-users/:userId", handleDeletePlatformUser);
  app.post("/api/super-admin/platform-users/:userId/delete", handleDeletePlatformUser);

  async function handleDeleteTenantUser(request: FastifyRequest, reply: FastifyReply) {
    const session = await readSession(request);
    if (!session || session.kind !== "platform") {
      return reply.status(401).send({ error: "No autorizado." });
    }
    const { userId } = request.params as { userId: string };
    const body = request.body as { tenantId?: string } | undefined;
    const q = request.query as { tenantId?: string };
    const tenantId =
      typeof q.tenantId === "string"
        ? q.tenantId
        : typeof body?.tenantId === "string"
          ? body.tenantId
          : "";
    const result = await deleteTenantUserForSuperAdmin(session, tenantId, userId);
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  }

  app.delete("/api/super-admin/tenant-users/:userId", handleDeleteTenantUser);
  app.post("/api/super-admin/tenant-users/:userId/delete", handleDeleteTenantUser);
}
