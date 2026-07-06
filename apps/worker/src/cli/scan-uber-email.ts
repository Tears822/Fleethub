/** Fast scan: find driver by email across Uber org rosters. */
import "../load-env.js";
import {
  listAllUberDrivers,
  listUberOrganizations,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";

const EMAIL = "kokireyesf04@gmail.com";

async function main() {
  const orgs = await listUberOrganizations();
  if (!orgs.ok) throw new Error(orgs.message);
  for (const org of orgs.data) {
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const row of listed.data) {
      const email = typeof row.email === "string" ? row.email.toLowerCase() : "";
      if (email === EMAIL) {
        console.log("HIT:", org.name, uberDriverExternalId(row), uberDriverDisplayName(row), email);
      }
    }
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
