import { createRequire } from "node:module";
import type { AppSession } from "@fleethub/auth";
import { listClosedLiquidationPdfGroups, loadShiftLiquidationDocument } from "@fleethub/auth";
import { buildLiquidationPdfBuffer } from "./liquidation-pdf.js";
import { getExportTranslator } from "./export-translator.js";

const require = createRequire(import.meta.url);
// archiver v5 (CJS default export) — v8+ is ESM-only and breaks `import archiver from "archiver"` under tsx.
const archiver = require("archiver") as (
  format: string,
  options?: { zlib?: { level?: number } },
) => {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "end", listener: () => void): void;
  append(source: Buffer, options: { name: string }): void;
  finalize(): Promise<void>;
  destroy(): void;
};

function safeZipEntryName(driverName: string, dayKey: string, driverId: string): string {
  const base = driverName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 48);
  return `Liquidacion_${base}_${dayKey}_${driverId.slice(0, 8)}.pdf`;
}

export async function buildClosedShiftsPdfZip(
  session: AppSession,
  dateFrom?: Date,
  dateTo?: Date,
): Promise<{ buffer: Buffer; fileCount: number; rangeLabel: string }> {
  const groupsResult = await listClosedLiquidationPdfGroups(session, { dateFrom, dateTo });
  if (!groupsResult.ok) {
    throw new Error(groupsResult.error.message);
  }

  const groups = groupsResult.value;
  const rangeLabel =
    dateFrom && dateTo
      ? `${dateFrom.toISOString().slice(0, 10)}_${dateTo.toISOString().slice(0, 10)}`
      : "todos";

  const t = await getExportTranslator(session);

  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  const zipPromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });

  let fileCount = 0;
  for (const group of groups) {
    const docResult = await loadShiftLiquidationDocument(session, {
      driverId: group.driverId,
      tripIds: group.tripIds,
      allowClosed: true,
    });
    if (!docResult.ok) continue;

    const pdf = await buildLiquidationPdfBuffer(docResult.value, t);
    archive.append(pdf, { name: safeZipEntryName(group.driverName, group.dayKey, group.driverId) });
    fileCount += 1;
  }

  if (fileCount === 0) {
    archive.destroy();
    throw new Error("No se pudo generar ningún PDF de liquidación.");
  }

  await archive.finalize();
  const buffer = await zipPromise;
  return { buffer, fileCount, rangeLabel };
}
