import "server-only";

import { cookies } from "next/headers";

/** Refresh Uber/FreeNow connection snapshots via FleetHub API (not bundled in Next). */
export async function refreshDriverConnectionsForTenantSession(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SERVER_URL?.trim().replace(/\/+$/, "");
  if (!base) return;

  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookie) return;

  try {
    await fetch(`${base}/api/tenant/live/refresh-connections`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
  } catch {
    /* API down or credentials missing — pages still show trip-based fallback */
  }
}
