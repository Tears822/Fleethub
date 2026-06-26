import "../load-env.js";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "../lib/freenow-client.js";

const names = ["MOUNIR", "YEFERSON", "SHAHID", "Taimoor"];
for (const companyId of ["GEYTMOBQGE", "HEYTIMZR"]) {
  const api = await listAllFreenowCompanyDrivers(companyId);
  console.log(`\n${companyId}: ${api.ok ? api.drivers.length : api.message}`);
  if (!api.ok) continue;
  for (const needle of names) {
    const hits = api.drivers.filter((d) =>
      freenowDriverDisplayName(d).toUpperCase().includes(needle.toUpperCase()),
    );
    if (hits.length) {
      for (const h of hits) {
        console.log(`  ${freenowDriverDisplayName(h)} → ${freenowPublicDriverId(h)}`);
      }
    }
  }
}
