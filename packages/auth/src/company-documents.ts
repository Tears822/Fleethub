import fs from "node:fs/promises";
import path from "node:path";
import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import { getUploadsRoot } from "./company-logo";
import type { AppSession } from "./types";

export const COMPANY_DOCUMENT_IDS = ["nda", "auth", "sepa"] as const;
export type CompanyDocumentId = (typeof COMPANY_DOCUMENT_IDS)[number];

export const COMPANY_DOCUMENT_CATALOG: Record<
  CompanyDocumentId,
  { title: string; defaultDetail: string }
> = {
  nda: {
    title: "Contrato confidencialidad",
    defaultDetail: "Acuerdo de confidencialidad con la empresa",
  },
  auth: {
    title: "Autorizaciones plataformas",
    defaultDetail: "Autorización de uso de cuentas en plataformas",
  },
  sepa: {
    title: "Mandato SEPA",
    defaultDetail: "Domiciliación bancaria",
  },
};

export type CompanyDocumentRecord = {
  id: CompanyDocumentId;
  title: string;
  status: "signed" | "pending";
  statusLabel: string;
  detail: string;
  fileUrl: string | null;
  fileName: string | null;
  uploadedAt: string | null;
  canDeleteUpload: boolean;
};

/** Visible en mantenimiento FleetHub (Super Admin). */
export type CompanyDocumentMaintenanceRecord = CompanyDocumentRecord & {
  pendingFleetHubPurge: boolean;
  deletedByTenantAt: string | null;
  retainedFileName: string | null;
  retainedDownloadUrl: string | null;
};

const MAX_DOC_BYTES = 5_242_880; // 5 MB

export function isDocumentId(id: string): id is CompanyDocumentId {
  return (COMPANY_DOCUMENT_IDS as readonly string[]).includes(id);
}

export async function deleteRetainedDocument(
  tenantId: string,
  companyId: string,
  docId: CompanyDocumentId,
): Promise<void> {
  const retained = documentRetainedFilesystemPath(tenantId, companyId, docId);
  try {
    await fs.unlink(retained);
  } catch {
    /* already removed */
  }
  const active = documentFilesystemPath(tenantId, companyId, docId);
  try {
    await fs.unlink(active);
  } catch {
    /* no active copy */
  }
}

function statusLabel(status: "signed" | "pending"): string {
  return status === "signed" ? "Firmado" : "Pendiente";
}

export function documentPublicUrl(
  tenantId: string,
  companyId: string,
  docId: CompanyDocumentId,
): string {
  return `/api/uploads/documents/${tenantId}/${companyId}/${docId}.pdf`;
}

export function documentFilesystemPath(
  tenantId: string,
  companyId: string,
  docId: CompanyDocumentId,
): string {
  return path.join(getUploadsRoot(), "documents", tenantId, companyId, `${docId}.pdf`);
}

export function documentRetainedFilesystemPath(
  tenantId: string,
  companyId: string,
  docId: CompanyDocumentId,
): string {
  return path.join(
    getUploadsRoot(),
    "documents",
    tenantId,
    companyId,
    "_retained",
    `${docId}.pdf`,
  );
}

export function documentRetainedDownloadUrl(companyId: string, docId: CompanyDocumentId): string {
  return `/api/super-admin/companies/${companyId}/documents/${docId}/retained`;
}

async function moveActiveDocumentToRetained(
  tenantId: string,
  companyId: string,
  docId: CompanyDocumentId,
): Promise<boolean> {
  const active = documentFilesystemPath(tenantId, companyId, docId);
  const retained = documentRetainedFilesystemPath(tenantId, companyId, docId);
  try {
    await fs.access(active);
  } catch {
    return false;
  }
  await fs.mkdir(path.dirname(retained), { recursive: true });
  try {
    await fs.rename(active, retained);
  } catch {
    await fs.copyFile(active, retained);
    await fs.unlink(active);
  }
  return true;
}

type ProfileJson = Record<string, unknown>;

function readProfileDocuments(profile: unknown): Partial<Record<CompanyDocumentId, ProfileJson>> {
  if (!profile || typeof profile !== "object") return {};
  const docs = (profile as ProfileJson).documents;
  if (!Array.isArray(docs)) return {};
  const out: Partial<Record<CompanyDocumentId, ProfileJson>> = {};
  for (const item of docs) {
    if (!item || typeof item !== "object") continue;
    const o = item as ProfileJson;
    const id = typeof o.id === "string" ? o.id : "";
    if (!isDocumentId(id)) continue;
    out[id] = o;
  }
  return out;
}

function readDeletedByTenantAt(row: ProfileJson | undefined): string | null {
  return typeof row?.deletedByTenantAt === "string" ? row.deletedByTenantAt : null;
}

function mapDocumentForTenant(
  id: CompanyDocumentId,
  row: ProfileJson | undefined,
): CompanyDocumentRecord {
  const cat = COMPANY_DOCUMENT_CATALOG[id];
  const deletedByTenantAt = readDeletedByTenantAt(row);
  const status =
    row?.status === "signed" || row?.status === "pending" ? row.status : "pending";
  const rawFileUrl = typeof row?.fileUrl === "string" ? row.fileUrl : null;
  const fileName = typeof row?.fileName === "string" ? row.fileName : null;
  const uploadedAt = typeof row?.uploadedAt === "string" ? row.uploadedAt : null;
  const hasActiveFile = Boolean(rawFileUrl) && !deletedByTenantAt;
  const fileUrl = hasActiveFile ? rawFileUrl : null;

  let effectiveStatus: "signed" | "pending" = "pending";
  if (deletedByTenantAt) {
    effectiveStatus = "pending";
  } else if (status === "signed") {
    effectiveStatus = "signed";
  } else if (hasActiveFile) {
    effectiveStatus = "pending";
  }

  let detail = cat.defaultDetail;
  if (deletedByTenantAt) {
    detail =
      "Documento retirado por su organización. Puede subir un PDF nuevo. FleetHub conserva el archivo anterior para auditoría.";
  } else if (hasActiveFile && fileName) {
    detail = `Archivo: ${fileName}${uploadedAt ? ` · ${uploadedAt.slice(0, 10)}` : ""}`;
  } else if (status === "signed" && !hasActiveFile) {
    detail = "Marcado como firmado (sin archivo digital)";
  }

  return {
    id,
    title: cat.title,
    status: effectiveStatus,
    statusLabel: statusLabel(effectiveStatus),
    detail,
    fileUrl,
    fileName: hasActiveFile ? fileName : null,
    uploadedAt: hasActiveFile ? uploadedAt : null,
    canDeleteUpload: hasActiveFile,
  };
}

export function listCompanyDocuments(profile: unknown): CompanyDocumentRecord[] {
  const stored = readProfileDocuments(profile);
  return COMPANY_DOCUMENT_IDS.map((id) => mapDocumentForTenant(id, stored[id]));
}

export function purgeDocumentFromProfile(
  profile: unknown,
  docId: CompanyDocumentId,
): ProfileJson {
  const base =
    profile && typeof profile === "object" ? { ...(profile as ProfileJson) } : {};
  const current = readProfileDocuments(base);
  const nextMap: Partial<Record<CompanyDocumentId, ProfileJson>> = {
    ...current,
    [docId]: { id: docId, status: "pending" },
  };
  base.documents = COMPANY_DOCUMENT_IDS.map((id) => nextMap[id] ?? { id, status: "pending" });
  return base;
}

export function listCompanyDocumentsForMaintenance(
  profile: unknown,
  companyId: string,
): CompanyDocumentMaintenanceRecord[] {
  const stored = readProfileDocuments(profile);
  return COMPANY_DOCUMENT_IDS.map((id) => {
    const base = mapDocumentForTenant(id, stored[id]);
    const row = stored[id];
    const deletedByTenantAt = readDeletedByTenantAt(row);
    const retainedFileName =
      typeof row?.retainedFileName === "string" ? row.retainedFileName : null;
    const pendingFleetHubPurge = Boolean(deletedByTenantAt && retainedFileName);
    return {
      ...base,
      pendingFleetHubPurge,
      deletedByTenantAt,
      retainedFileName,
      retainedDownloadUrl: pendingFleetHubPurge
        ? documentRetainedDownloadUrl(companyId, id)
        : null,
    };
  });
}

async function mergeProfileDocuments(
  tenantId: string,
  companyId: string,
  updater: (
    docs: Partial<Record<CompanyDocumentId, ProfileJson>>,
  ) => Partial<Record<CompanyDocumentId, ProfileJson>>,
): Promise<Result<CompanyDocumentRecord[], { message: string }>> {
  return withTenant(tenantId, async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, profile: true },
    });
    if (!company) return err({ message: "Empresa no encontrada." });

    const profile =
      company.profile && typeof company.profile === "object"
        ? { ...(company.profile as ProfileJson) }
        : {};

    const current = readProfileDocuments(profile);
    const nextMap = updater(current);
    const documentsArray = COMPANY_DOCUMENT_IDS.map((id) => {
      const row = nextMap[id];
      if (!row) return { id, status: "pending" };
      return row;
    });

    profile.documents = documentsArray;

    await tx.company.update({
      where: { id: companyId },
      data: { profile: profile as object },
    });

    return ok(listCompanyDocuments(profile));
  });
}

function parsePdfDataUrl(
  dataUrl: string,
  fileName?: string,
): Result<{ buffer: Buffer }, { message: string }> {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:application\/pdf;base64,(.+)$/i);
  if (!match) {
    return err({
      message: "Solo se permiten archivos PDF (application/pdf).",
    });
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[1]!, "base64");
  } catch {
    return err({ message: "No se pudo decodificar el PDF." });
  }
  if (buffer.length === 0 || buffer.length > MAX_DOC_BYTES) {
    return err({ message: "El PDF debe ser mayor que 0 y menor de 5 MB." });
  }
  if (fileName && !/\.pdf$/i.test(fileName)) {
    return err({ message: "El archivo debe tener extensión .pdf" });
  }
  return ok({ buffer });
}

function requireAdmin(session: AppSession): Result<true, { message: string }> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  if (session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "Solo el administrador puede gestionar documentos." });
  }
  return ok(true);
}

export async function uploadCompanyDocument(
  session: AppSession,
  companyId: string,
  docId: string,
  dataUrl: string,
  fileName?: string,
): Promise<Result<{ documents: CompanyDocumentRecord[] }, { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;
  if (!isDocumentId(docId)) {
    return err({ message: "Tipo de documento no válido." });
  }

  const parsed = parsePdfDataUrl(dataUrl, fileName);
  if (!parsed.ok) return parsed;

  const tenantId = session.tid!;
  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const dir = path.join(getUploadsRoot(), "documents", tenantId, id);
  await fs.mkdir(dir, { recursive: true });
  const filePath = documentFilesystemPath(tenantId, id, docId);
  await fs.writeFile(filePath, parsed.value.buffer);

  const publicUrl = documentPublicUrl(tenantId, id, docId);
  const safeName =
    (fileName?.trim() || `${docId}.pdf`).replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120) ||
    `${docId}.pdf`;
  const uploadedAt = new Date().toISOString();

  const result = await mergeProfileDocuments(tenantId, id, (current) => ({
    ...current,
    [docId]: {
      id: docId,
      status: "pending",
      fileUrl: publicUrl,
      fileName: safeName,
      uploadedAt,
    },
  }));

  if (!result.ok) return result;

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "company.document.upload",
    entityType: "company",
    entityId: id,
    payload: { docId, fileName: safeName },
  });

  return ok({ documents: result.value });
}

export async function setCompanyDocumentStatus(
  session: AppSession,
  companyId: string,
  docId: string,
  status: "signed" | "pending",
): Promise<Result<{ documents: CompanyDocumentRecord[] }, { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;
  if (!isDocumentId(docId)) {
    return err({ message: "Tipo de documento no válido." });
  }
  if (status !== "signed" && status !== "pending") {
    return err({ message: "Estado no válido." });
  }

  const tenantId = session.tid!;
  const id = companyId.trim();

  const result = await mergeProfileDocuments(tenantId, id, (current) => {
    const prev = current[docId] ?? { id: docId };
    return {
      ...current,
      [docId]: { ...prev, id: docId, status },
    };
  });

  if (!result.ok) return result;

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "company.document.status",
    entityType: "company",
    entityId: id,
    payload: { docId, status },
  });

  return ok({ documents: result.value });
}

/** Retira el PDF para el tenant; conserva copia en _retained para auditoría / Super Admin. */
export async function requestTenantCompanyDocumentRemoval(
  session: AppSession,
  companyId: string,
  docId: string,
): Promise<Result<{ documents: CompanyDocumentRecord[] }, { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;
  if (!isDocumentId(docId)) {
    return err({ message: "Tipo de documento no válido." });
  }

  const tenantId = session.tid!;
  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const moved = await moveActiveDocumentToRetained(tenantId, id, docId);
  if (!moved) {
    return err({ message: "No hay documento subido para eliminar." });
  }

  const removedAt = new Date().toISOString();

  const result = await mergeProfileDocuments(tenantId, id, (current) => {
    const prev = current[docId] ?? { id: docId };
    const retainedFileName =
      typeof prev.fileName === "string" ? prev.fileName : `${docId}.pdf`;
    return {
      ...current,
      [docId]: {
        id: docId,
        status: "pending",
        deletedByTenantAt: removedAt,
        deletedByTenantUserId: session.sub,
        retainedFileName,
        retainedAt: removedAt,
      },
    };
  });

  if (!result.ok) return result;

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "company.document.tenant_remove",
    entityType: "company",
    entityId: id,
    payload: { docId, retained: true },
  });

  return ok({ documents: result.value });
}
