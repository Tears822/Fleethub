import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsRoot } from "@fleethub/auth";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function resolveLogoFileFromRequest(
  tenantId: string,
  filename: string,
): string | null {
  if (!SAFE_SEGMENT.test(tenantId)) return null;
  const match = filename.match(/^([a-f0-9-]{36})\.(png|jpe?g|webp)$/i);
  if (!match) return null;
  const [, companyId, ext] = match;
  const normalizedExt = ext!.toLowerCase() === "jpeg" ? "jpg" : ext!.toLowerCase();
  return path.join(getUploadsRoot(), "logos", tenantId, `${companyId}.${normalizedExt}`);
}

export async function readLogoFile(filePath: string): Promise<Buffer | null> {
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch {
    return null;
  }
}
