/**
 * Print FreeNow booking examples for taxímetro vs T3 email / validation.
 *
 * Usage:
 *   npx tsx src/cli/freenow-fare-examples.ts
 *   npx tsx src/cli/freenow-fare-examples.ts --from 2026-06-02 --to 2026-06-09
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { mapFreenowFareType } from "../lib/freenow-fare-type.js";

config({ path: resolve(process.cwd(), "../../.env") });

type RawBooking = {
  subFleetTypeId?: string | null;
  fleetTypeId?: string | null;
  paymentMethod?: string | null;
  fixedFare?: boolean | null;
};

function parseArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const fromStr = parseArg("--from") ?? "2026-06-02";
  const toStr = parseArg("--to") ?? "2026-06-09";
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);

  const bookings = await listFreenowCompanyBookings({
    publicCompanyId: "GEYTMOBQGE",
    from,
    to,
  });
  if (!bookings.ok) {
    console.error("getCompanyBookings failed:", bookings.message);
    process.exit(1);
  }

  const acc = bookings.bookings.filter((b) => b.state === "ACCOMPLISHED");
  const dist = new Map<string, number>();
  const bySubId = new Map<string, object>();
  const unmapped: object[] = [];

  for (const b of acc) {
    const raw = b as RawBooking;
    const sid = raw.subFleetTypeId?.trim() || "(none)";
    dist.set(sid, (dist.get(sid) ?? 0) + 1);
    const fare = mapFreenowFareType(
      b.hailingType,
      b.subFleetTypeLabel,
      raw.subFleetTypeId,
      raw.fixedFare,
    );
    const row = {
      id: b.id,
      subFleetTypeId: raw.subFleetTypeId ?? null,
      subFleetTypeLabel: b.subFleetTypeLabel ?? null,
      fixedFare: raw.fixedFare ?? null,
      hailingType: b.hailingType,
      fleetTypeId: raw.fleetTypeId ?? null,
      paymentMethod: raw.paymentMethod ?? null,
      amountEur: b.tourValue?.amount,
      driver: b.driver?.name,
      ourClassification: fare,
    };
    if (!bySubId.has(sid)) bySubId.set(sid, row);
    if (!fare || fare === "TAXI" || !["Precio cerrado (T3)", "Taxímetro"].includes(fare)) {
      unmapped.push(row);
    }
  }

  const mapped = { t3: 0, meter: 0, other: 0 };
  for (const b of acc) {
    const raw = b as RawBooking;
    const fare = mapFreenowFareType(
      b.hailingType,
      b.subFleetTypeLabel,
      raw.subFleetTypeId,
      raw.fixedFare,
    );
    if (fare === "Precio cerrado (T3)") mapped.t3 += 1;
    else if (fare === "Taxímetro") mapped.meter += 1;
    else mapped.other += 1;
  }

  console.log("Window:", fromStr, "→", toStr);
  console.log("ACCOMPLISHED:", acc.length);
  console.log("subFleetTypeLabel present:", acc.filter((b) => b.subFleetTypeLabel?.trim()).length);
  console.log(
    "fixedFare present:",
    acc.filter((b) => (b as RawBooking).fixedFare !== undefined).length,
  );
  console.log("subFleetTypeId distribution:", Object.fromEntries(dist));
  console.log("Our classification:", mapped);

  console.log("\n--- One example per subFleetTypeId ---");
  for (const row of bySubId.values()) {
    console.log(JSON.stringify(row));
  }

  const t3Ex = acc.find(
    (b) =>
      mapFreenowFareType(
        b.hailingType,
        b.subFleetTypeLabel,
        (b as RawBooking).subFleetTypeId,
      ) === "Precio cerrado (T3)",
  );
  const meterEx = acc.find(
    (b) =>
      mapFreenowFareType(
        b.hailingType,
        b.subFleetTypeLabel,
        (b as RawBooking).subFleetTypeId,
      ) === "Taxímetro",
  );

  console.log("\n--- Email payload snippets (minimal) ---");
  console.log(
    "T3 (precio cerrado):",
    JSON.stringify(
      {
        id: t3Ex?.id,
        hailingType: t3Ex?.hailingType,
        fleetTypeId: (t3Ex as RawBooking)?.fleetTypeId,
        subFleetTypeId: (t3Ex as RawBooking)?.subFleetTypeId,
        subFleetTypeLabel: t3Ex?.subFleetTypeLabel ?? null,
      },
      null,
      2,
    ),
  );
  console.log(
    "Taxímetro:",
    JSON.stringify(
      {
        id: meterEx?.id,
        hailingType: meterEx?.hailingType,
        fleetTypeId: (meterEx as RawBooking)?.fleetTypeId,
        subFleetTypeId: (meterEx as RawBooking)?.subFleetTypeId,
        subFleetTypeLabel: meterEx?.subFleetTypeLabel ?? null,
      },
      null,
      2,
    ),
  );

  if (unmapped.length > 0) {
    console.log("\n--- Unmapped / ambiguous (" + unmapped.length + ") ---");
    for (const row of unmapped.slice(0, 8)) {
      console.log(JSON.stringify(row));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
