import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createTenantCompany,
  requestTenantCompanyDocumentRemoval,
  updateTenantCompany,
  uploadCompanyDocument,
  uploadCompanyLogo,
} from "@fleethub/auth";
import { httpStatusForRbacError, requireAdminTenant } from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function handleRbacError(reply: FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  return reply.status(httpStatusForRbacError(code)).send({
    error: code === "FORBIDDEN" ? "No autorizado para esta acción." : "No autorizado.",
  });
}

export async function registerTenantCompaniesRoutes(app: FastifyInstance) {
  app.post("/api/tenant/companies", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const result = await createTenantCompany(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true, companyId: result.value.companyId });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/companies/:companyId/logo", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { companyId } = request.params as { companyId: string };
      const body = request.body as { dataUrl?: string };
      const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
      if (!dataUrl) {
        return reply.status(400).send({ error: "Indica una imagen (dataUrl)." });
      }
      const result = await uploadCompanyLogo(session, companyId, dataUrl);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true, logoUrl: result.value.logoUrl });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/companies/:companyId/documents/:docId", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { companyId, docId } = request.params as { companyId: string; docId: string };
      const body = request.body as { dataUrl?: string; fileName?: string };
      const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
      if (!dataUrl) {
        return reply.status(400).send({ error: "Indica un archivo PDF (dataUrl)." });
      }
      const result = await uploadCompanyDocument(
        session,
        companyId,
        docId,
        dataUrl,
        body.fileName,
      );
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true, documents: result.value.documents });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.delete("/api/tenant/companies/:companyId/documents/:docId", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { companyId, docId } = request.params as { companyId: string; docId: string };
      const result = await requestTenantCompanyDocumentRemoval(session, companyId, docId);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true, documents: result.value.documents });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/companies/:companyId", async (request, reply) => {
    try {
      const session = requireAdminTenant(await readSession(request));
      const { companyId } = request.params as { companyId: string };
      const result = await updateTenantCompany(session, companyId, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send({ ok: true });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });
}
