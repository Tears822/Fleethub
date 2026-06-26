import fs from "node:fs/promises";
import path from "node:path";
import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";

const MAX_LOGO_BYTES = 512_000;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function getUploadsRoot(): string {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "uploads");
}

export function logoPublicUrl(tenantId: string, companyId: string, ext: string): string {
  return `/api/uploads/logos/${tenantId}/${companyId}.${ext}`;
}

export function logoFilesystemPath(tenantId: string, companyId: string, ext: string): string {
  return path.join(getUploadsRoot(), "logos", tenantId, `${companyId}.${ext}`);
}

/** Map stored logoUrl to an absolute file path for PDF embedding. */
export async function resolveLogoFilesystemPath(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl?.trim()) return null;
  const match = logoUrl.trim().match(/^\/api\/uploads\/logos\/([^/]+)\/([^/.]+)\.(png|jpe?g|webp)$/i);
  if (!match) return null;
  const [, tenantId, companyId, ext] = match;
  const normalized = ext!.toLowerCase() === "jpeg" ? "jpg" : ext!.toLowerCase();
  const filePath = logoFilesystemPath(tenantId!, companyId!, normalized);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

function extFromMime(mime: string): string | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  return null;
}

export function parseLogoDataUrl(
  dataUrl: string,
): Result<{ buffer: Buffer; ext: string }, { message: string }> {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) {
    return err({ message: "Formato de imagen no válido (se espera data URL base64)." });
  }
  const mime = match[1]!.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return err({ message: "Solo se permiten PNG, JPEG o WebP." });
  }
  const ext = extFromMime(mime);
  if (!ext) return err({ message: "Tipo de imagen no soportado." });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2]!, "base64");
  } catch {
    return err({ message: "No se pudo decodificar la imagen." });
  }
  if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) {
    return err({ message: "La imagen debe ser menor de 512 KB." });
  }
  return ok({ buffer, ext });
}

export async function uploadCompanyLogo(
  session: AppSession,
  companyId: string,
  dataUrl: string,
): Promise<Result<{ logoUrl: string }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  if (session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "Solo el administrador puede subir el logo." });
  }

  const parsed = parseLogoDataUrl(dataUrl);
  if (!parsed.ok) return parsed;

  const { buffer, ext } = parsed.value;
  const tenantId = session.tid;
  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const company = await withTenant(tenantId, (tx) =>
    tx.company.findFirst({ where: { id, tenantId }, select: { id: true, logoUrl: true } }),
  );
  if (!company) return err({ message: "Empresa no encontrada." });

  const dir = path.join(getUploadsRoot(), "logos", tenantId);
  await fs.mkdir(dir, { recursive: true });

  const filePath = logoFilesystemPath(tenantId, id, ext);
  await fs.writeFile(filePath, buffer);

  const publicUrl = logoPublicUrl(tenantId, id, ext);

  if (company.logoUrl && company.logoUrl !== publicUrl) {
    const old = await resolveLogoFilesystemPath(company.logoUrl);
    if (old && old !== filePath) {
      await fs.unlink(old).catch(() => undefined);
    }
  }

  await withTenant(tenantId, (tx) =>
    tx.company.update({ where: { id }, data: { logoUrl: publicUrl } }),
  );

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "company.logo.upload",
    entityType: "company",
    entityId: id,
    payload: { logoUrl: publicUrl },
  });

  return ok({ logoUrl: publicUrl });
}
