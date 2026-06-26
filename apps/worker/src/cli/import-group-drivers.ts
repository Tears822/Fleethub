/**
 * Import drivers from grupo Excel/CSV (conductores por empresa y plataforma).
 *
 * Usage:
 *   npx tsx src/cli/import-group-drivers.ts cosculluela fixtures/cosculluela-group-drivers.csv
 *   npx tsx src/cli/import-group-drivers.ts cosculluela fixtures/cosculluela-group-drivers.csv --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { importGroupDriverSpreadsheetFromFile } from "../lib/group-driver-spreadsheet-import.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const csvArg = process.argv[3]?.trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantSlug || !csvArg) {
    console.error(
      "Usage: import-group-drivers.ts <tenant-slug> <csv-path> [--dry-run]",
    );
    process.exit(1);
  }

  const csvPath = path.isAbsolute(csvArg) ? csvArg : path.resolve(process.cwd(), csvArg);

  console.log("=== Import group drivers ===");
  console.log("Tenant:", tenantSlug);
  console.log("CSV:", csvPath);
  console.log("Dry run:", dryRun);

  const result = await importGroupDriverSpreadsheetFromFile({
    tenantSlug,
    csvPath,
    dryRun,
  });

  if ("error" in result) {
    console.error("Failed:", result.error);
    process.exit(1);
  }

  console.log("Stats:", result);
  if (result.errors.length > 0) {
    console.log("Errors (first 20):");
    for (const e of result.errors.slice(0, 20)) console.log(" -", e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
