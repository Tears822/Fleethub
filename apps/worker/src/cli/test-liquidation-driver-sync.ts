import "../load-env.js";
import { runLiquidationDriverSync } from "../sync/run-liquidation-driver-sync.js";

const TENANT_ID = process.argv[2] ?? "442462fa-ee23-4009-bb5f-919032762333";
const DRIVER_ID = process.argv[3] ?? "c7ca5ba2-ff8b-4738-8ddc-00e04c6ded12";

async function main() {
  const t0 = Date.now();
  const result = await runLiquidationDriverSync(TENANT_ID, DRIVER_ID);
  console.log("Result:", result);
  console.log("Elapsed:", Math.round((Date.now() - t0) / 1000) + "s");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
