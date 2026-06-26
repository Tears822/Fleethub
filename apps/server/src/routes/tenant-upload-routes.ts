import type { FastifyInstance } from "fastify";
import { readDocumentFile, resolveDocumentFileFromRequest } from "../lib/company-document-files.js";
import { readLogoFile, resolveLogoFileFromRequest } from "../lib/company-logo-files.js";

export async function registerTenantUploadRoutes(app: FastifyInstance) {
  app.get("/api/uploads/logos/:tenantId/:filename", async (request, reply) => {
    const { tenantId, filename } = request.params as { tenantId: string; filename: string };
    const filePath = resolveLogoFileFromRequest(tenantId, filename);
    if (!filePath) {
      return reply.status(404).send({ error: "No encontrado." });
    }

    const buffer = await readLogoFile(filePath);
    if (!buffer) {
      return reply.status(404).send({ error: "No encontrado." });
    }

    const ext = filename.split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    reply.header("Cache-Control", "public, max-age=86400").type(type).send(buffer);
  });

  app.get(
    "/api/uploads/documents/:tenantId/:companyId/:docId.pdf",
    async (request, reply) => {
      const { tenantId, companyId, docId } = request.params as {
        tenantId: string;
        companyId: string;
        docId: string;
      };
      const filePath = resolveDocumentFileFromRequest(tenantId, companyId, docId);
      if (!filePath) {
        return reply.status(404).send({ error: "No encontrado." });
      }
      const buffer = await readDocumentFile(filePath);
      if (!buffer) {
        return reply.status(404).send({ error: "No encontrado." });
      }
      reply
        .header("Cache-Control", "private, max-age=3600")
        .header("Content-Disposition", `inline; filename="${docId}.pdf"`)
        .type("application/pdf")
        .send(buffer);
    },
  );
}
