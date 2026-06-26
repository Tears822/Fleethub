/** Query specific drivers in a tenant. */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

const slug = process.argv[2] ?? "trevino";
const needles = process.argv.slice(3);
if (needles.length === 0) needles.push("MOUNIR", "YEFERSON", "YOUSEF", "DOkkali", "François", "FRANCESC");

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  for (const needle of needles) {
    const rows = await withoutTenant(
      (tx) =>
        tx.driver.findMany({
          where: { tenantId: tenant.id, fullName: { contains: needle, mode: "insensitive" } },
          select: {
            id: true,
            fullName: true,
            isActive: true,
            email: true,
            dni: true,
            company: { select: { legalName: true } },
            driverPlatformAccounts: {
              select: {
                platform: true,
                isActive: true,
                externalDriverId: true,
                metadata: true,
              },
            },
            _count: { select: { trips: true } },
          },
          orderBy: { fullName: "asc" },
        }),
      undefined,
      tenant.id,
    );
    console.log(`\n[${slug}] contains "${needle}": ${rows.length}`);
    for (const r of rows) {
      console.log(JSON.stringify(r));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
