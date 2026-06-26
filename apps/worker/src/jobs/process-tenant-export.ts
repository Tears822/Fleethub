import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { Job } from "bullmq";
import type { CompanyScope } from "@fleethub/auth/tenant-scope";
import { writeTenantTripsExportCsvToFile } from "@fleethub/auth/tenant-trip-export";
import { withTenant } from "@fleethub/db";

export type TenantExportJobData = {
  kind: "trips-csv";
  tenantId: string;
  scope: CompanyScope;
};

export type TenantExportJobResult = {
  filePath: string;
  rowCount: number;
  filename: string;
};

function exportDataDir(): string {
  return process.env.EXPORT_DATA_DIR?.trim() || "/tmp/fleethub-exports";
}

export async function processTenantExportJob(
  job: Job<TenantExportJobData>,
): Promise<TenantExportJobResult> {
  if (job.data.kind !== "trips-csv") {
    throw new Error(`Unknown export kind: ${String((job.data as { kind?: string }).kind)}`);
  }

  const dir = exportDataDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${job.id}-viajes.csv`);

  const rowCount = await withTenant(job.data.tenantId, (tx) =>
    writeTenantTripsExportCsvToFile(tx, job.data.tenantId, job.data.scope, filePath),
  );

  return { filePath, rowCount, filename: "viajes.csv" };
}
