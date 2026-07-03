import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

const since7d = new Date(Date.now() - 7 * 86400000);

const failed = await withoutTenant((tx) =>
  tx.syncRun.findMany({
    where: {
      platform: "UBER",
      status: { in: ["failed", "FAILED"] },
      startedAt: { gte: since7d },
    },
    orderBy: { startedAt: "desc" },
    select: {
      startedAt: true,
      status: true,
      errorMessage: true,
      tenant: { select: { slug: true } },
    },
  }),
);

console.log("UBER FAILED last 7d:", failed.length);
for (const f of failed) {
  console.log(
    f.tenant.slug,
    f.startedAt.toISOString().slice(0, 16),
    (f.errorMessage ?? "—").slice(0, 100),
  );
}

const partial = await withoutTenant((tx) =>
  tx.syncRun.count({
    where: {
      platform: "UBER",
      status: "PARTIAL",
      startedAt: { gte: new Date(Date.now() - 24 * 3600000) },
    },
  }),
);
console.log("\nUBER PARTIAL last 24h:", partial, "(normal: few trips without Uber amounts)");
