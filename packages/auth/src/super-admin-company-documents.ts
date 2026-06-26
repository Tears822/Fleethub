import fs from "node:fs/promises";
import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withoutTenant, writeAuditLog } from "@fleethub/db";
import {
  deleteRetainedDocument,
  documentRetainedFilesystemPath,
  isDocumentId,
  listCompanyDocumentsForMaintenance,
  purgeDocumentFromProfile,
  type CompanyDocumentId,
  type CompanyDocumentMaintenanceRecord,
} from "./company-documents";
import type { AppSession } from "./types";

function requirePlatform(session: AppSession): Result<true, { message: string }> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }
  return ok(true);
}

export async function listCompanyDocumentsForSuperAdmin(
  companyId: string,
): Promise<Result<{ documents: CompanyDocumentMaintenanceRecord[] }, { message: string }>> {
  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const company = await withoutTenant((tx) =>
    tx.company.findUnique({
      where: { id },
      select: { id: true, profile: true },
    }),
  );
  if (!company) return err({ message: "Empresa no encontrada." });

  return ok({
    documents: listCompanyDocumentsForMaintenance(company.profile, company.id),
  });
}

export async function readRetainedCompanyDocument(
  companyId: string,
  docId: string,
): Promise<Result<{ buffer: Buffer; fileName: string }, { message: string }>> {
  if (!isDocumentId(docId)) {
    return err({ message: "Tipo de documento no válido." });
  }

  const company = await withoutTenant((tx) =>
    tx.company.findUnique({
      where: { id: companyId.trim() },
      select: { id: true, tenantId: true, profile: true },
    }),
  );
  if (!company) return err({ message: "Empresa no encontrada." });

  const docs = listCompanyDocumentsForMaintenance(company.profile, company.id);
  const row = docs.find((d) => d.id === docId);
  if (!row?.pendingFleetHubPurge) {
    return err({ message: "No hay copia retenida de este documento." });
  }

  const filePath = documentRetainedFilesystemPath(company.tenantId, company.id, docId);
  try {
    const buffer = await fs.readFile(filePath);
    return ok({
      buffer,
      fileName: row.retainedFileName ?? `${docId}.pdf`,
    });
  } catch {
    return err({ message: "Archivo retenido no encontrado en el servidor." });
  }
}

export async function purgeCompanyDocumentForSuperAdmin(
  session: AppSession,
  companyId: string,
  docId: string,
): Promise<Result<{ documents: CompanyDocumentMaintenanceRecord[] }, { message: string }>> {
  const auth = requirePlatform(session);
  if (!auth.ok) return auth;
  if (!isDocumentId(docId)) {
    return err({ message: "Tipo de documento no válido." });
  }

  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const company = await withoutTenant((tx) =>
    tx.company.findUnique({
      where: { id },
      select: { id: true, tenantId: true, profile: true },
    }),
  );
  if (!company) return err({ message: "Empresa no encontrada." });

  const stored = listCompanyDocumentsForMaintenance(company.profile, company.id);
  const target = stored.find((d) => d.id === docId);
  if (!target?.pendingFleetHubPurge) {
    return err({
      message: "No hay documento pendiente de eliminación definitiva por FleetHub.",
    });
  }

  await deleteRetainedDocument(company.tenantId, company.id, docId as CompanyDocumentId);

  const nextProfile = purgeDocumentFromProfile(company.profile, docId as CompanyDocumentId);

  await withoutTenant(async (tx) => {
    await tx.company.update({
      where: { id },
      data: { profile: nextProfile as object },
    });
  }, undefined, company.tenantId);

  await writeAuditLog({
    tenantId: company.tenantId,
    actorUserId: session.sub,
    action: "company.document.super_admin_purge",
    entityType: "company",
    entityId: id,
    payload: { docId },
  });

  const updated = await withoutTenant(
    (tx) => tx.company.findUnique({ where: { id }, select: { profile: true } }),
    undefined,
    company.tenantId,
  );

  return ok({
    documents: listCompanyDocumentsForMaintenance(updated?.profile ?? null, id),
  });
}
