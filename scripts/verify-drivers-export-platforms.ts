import path from "node:path";
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { buildDriversXlsx } from "../apps/server/dist/lib/drivers-export.js";
import { withoutTenant } from "@fleethub/db";

config({ path: path.resolve("fleethub/.env") });

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "trade-taxi-sl" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const buf = await buildDriversXlsx({
    kind: "tenant",
    tid: tenant.id,
    sub: "test",
    role: "ADMIN_TENANT",
    email: "test@test.com",
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0]!;
  const headers = sheet.getRow(1).values as string[];
  console.log("Column E (5):", headers[5]);
  console.log("Sample platforms:", sheet.getRow(2).getCell(5).text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
