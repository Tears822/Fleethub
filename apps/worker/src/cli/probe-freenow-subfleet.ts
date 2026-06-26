import { config } from "dotenv";
import { resolve } from "node:path";
import { getFreenowAccessToken } from "../lib/freenow-client.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { freenowSdkCall } from "../lib/freenow-sdk.js";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const token = await getFreenowAccessToken(true);
  if (!token.ok) throw new Error(token.message);

  const from = "2026-06-02T00:00:00Z";
  const to = "2026-06-09T00:00:00Z";
  const url = `https://api.live.free-now.com/partnerpublicgatewayservice/api/v1/companies/GEYTMOBQGE/bookings?from=${from}&to=${to}&page=0&size=50`;

  console.log("Token scope:", token.meta.scope ?? "(none)");
  console.log("URL:", url);

  const raw = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.meta.accessToken}`,
      Accept: "application/json",
    },
  });
  const json = (await raw.json()) as {
    content?: Array<{
      id?: string;
      subFleetTypeLabel?: string;
      subFleetTypeId?: number | string;
      fleetTypeId?: number | string;
      fixedFare?: boolean;
    }>;
    metadata?: { totalPages?: number };
  };
  console.log("RAW status:", raw.status, "| rows page0:", json.content?.length ?? 0);

  const labels = new Map<string, number>();
  const subIds = new Map<string, number>();
  const fixedFare = new Map<string, number>();
  for (const b of json.content ?? []) {
    const l = b.subFleetTypeLabel ?? "(missing label)";
    labels.set(l, (labels.get(l) ?? 0) + 1);
    const sid = String(b.subFleetTypeId ?? "(missing id)");
    subIds.set(sid, (subIds.get(sid) ?? 0) + 1);
    const ff =
      b.fixedFare === true ? "true" : b.fixedFare === false ? "false" : "(missing)";
    fixedFare.set(ff, (fixedFare.get(ff) ?? 0) + 1);
  }
  console.log("RAW subFleetTypeLabel:", Object.fromEntries(labels));
  console.log("RAW subFleetTypeId:", Object.fromEntries(subIds));
  console.log("RAW fixedFare:", Object.fromEntries(fixedFare));
  console.log(
    "RAW sample:",
    JSON.stringify(
      (json.content ?? []).slice(0, 3).map((b) => ({
        id: b.id,
        fleetTypeId: b.fleetTypeId,
        subFleetTypeId: b.subFleetTypeId,
        subFleetTypeLabel: b.subFleetTypeLabel,
        fixedFare: b.fixedFare,
      })),
      null,
      2,
    ),
  );

  const sdk = await freenowSdkCall("getCompanyBookings", (s) =>
    s.getCompanyBookings({
      publicCompanyId: "GEYTMOBQGE",
      from,
      to,
      page: 0,
      size: 50,
    } as Parameters<typeof s.getCompanyBookings>[0]),
  );
  if (sdk.ok) {
    const sdkLabels = new Map<string, number>();
    for (const b of sdk.data.content ?? []) {
      const l = b.subFleetTypeLabel?.trim() || "(missing)";
      sdkLabels.set(l, (sdkLabels.get(l) ?? 0) + 1);
    }
    console.log("SDK subFleetTypeLabel:", Object.fromEntries(sdkLabels));
    console.log("SDK first keys:", Object.keys(sdk.data.content?.[0] ?? {}).join(", "));
  } else {
    console.log("SDK error:", sdk.message);
  }

  const listed = await listFreenowCompanyBookings({
    publicCompanyId: "GEYTMOBQGE",
    from: new Date(from),
    to: new Date(to),
  });
  if (listed.ok) {
    const n = listed.bookings.filter((b) => b.subFleetTypeLabel?.trim()).length;
    console.log("listFreenowCompanyBookings:", listed.bookings.length, "| with label:", n);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
