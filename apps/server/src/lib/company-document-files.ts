import fs from "node:fs/promises";
import path from "node:path";
import { COMPANY_DOCUMENT_IDS, getUploadsRoot } from "@fleethub/auth";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;
const UUID = /^[a-f0-9-]{36}$/i;

export function resolveDocumentFileFromRequest(
  tenantId: string,
  companyId: string,
  docId: string,
): string | null {
  if (!SAFE_SEGMENT.test(tenantId)) return null;
  if (!UUID.test(companyId)) return null;
  if (!(COMPANY_DOCUMENT_IDS as readonly string[]).includes(docId)) return null;
  return path.join(getUploadsRoot(), "documents", tenantId, companyId, `${docId}.pdf`);
}

export async function readDocumentFile(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}
