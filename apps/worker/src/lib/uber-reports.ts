import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { withTenant } from "@fleethub/db";
import { sleepWithSyncHeartbeat } from "./sync-run-heartbeat.js";
import { csvRowsToObjects, parseCsv } from "./uber-csv.js";
import {
  countTripsWithAmounts,
  filterPaymentsDriverRows,
  tripsInWindowMissingAmounts,
} from "./uber-payments-driver-mapper.js";
import {
  orderUberOrgIds,
  persistDriverUberSyncOrgId,
  resolveTenantUberOrgIds,
  uberSyncOrgIdFromMetadata,
  type UberOrgRef,
} from "./uber-tenant-group-orgs.js";
import { mergeUberDriverTripUpserts } from "./uber-driver-mappers.js";
import { paymentsDriverReportIsTripLevel } from "./uber-csv-columns.js";
import {
  type UberFleetResult,
  uberFleetPost,
  uberFleetGet,
} from "./uber-fleet-client.js";
import {
  filterTripActivityRows,
  type UberTripActivityRow,
} from "./uber-trip-activity-mapper.js";

export const UBER_REPORT_TYPE_TRIP_ACTIVITY = "REPORT_TYPE_TRIP_ACTIVITY";
export const UBER_REPORT_TYPE_DRIVER_ACTIVITY = "REPORT_TYPE_DRIVER_ACTIVITY";
export const UBER_REPORT_TYPE_PAYMENTS_DRIVER = "REPORT_TYPE_PAYMENTS_DRIVER";
export const UBER_REPORT_TYPE_PAYMENTS_ORDER = "REPORT_TYPE_PAYMENTS_ORDER";

const MAX_REPORT_CHUNK_MS = 7 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 60;
const PAYMENTS_POLL_MAX_ATTEMPTS = 120;
const REPORT_RATE_LIMIT_MS = 20_000;
const PAYMENTS_REPORT_MAX_RETRIES = 3;
const PAYMENTS_REPORT_RETRY_MS = 20_000;
/** Reuse completed report CSV across poll jobs to avoid Uber report-generation 429s. */
const TRIP_ACTIVITY_REUSE_MS = 20 * 60 * 1000;
const PAYMENTS_REPORT_REUSE_MS = 45 * 60 * 1000;

type CachedReportRows = { fetchedAt: number; data: UberTripActivityRow[] };

const tripActivityDataCache = new Map<string, CachedReportRows>();
const paymentsOrderDataCache = new Map<string, CachedReportRows>();
const paymentsDriverDataCache = new Map<string, CachedReportRows>();

function reportRowsCacheKey(orgId: string, reportType: string, from: Date, to: Date): string {
  return `${reportType}:${orgId}:${from.getTime()}:${to.getTime()}`;
}

function reusedReportRows(
  cache: Map<string, CachedReportRows>,
  key: string,
  reuseMs: number,
): UberTripActivityRow[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > reuseMs) return null;
  return entry.data;
}

function storeReportRows(
  cache: Map<string, CachedReportRows>,
  key: string,
  data: UberTripActivityRow[],
): void {
  if (data.length === 0) return;
  cache.set(key, { fetchedAt: Date.now(), data });
}

function syncPaymentsOrderReport(): boolean {
  const v = process.env.UBER_SYNC_PAYMENTS_ORDER?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function syncPaymentsDriverReport(): boolean {
  const v = process.env.UBER_SYNC_PAYMENTS_REPORT?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  const legacy = process.env.UBER_SYNC_TRY_PAYMENTS_REPORT?.trim().toLowerCase();
  if (legacy === "0" || legacy === "false" || legacy === "no") return false;
  return true;
}

type UberReportEntity = {
  id?: string;
  status?: string;
  reportType?: string;
  failedReason?: string;
};

function reportPath(orgId: string, reportId?: string, suffix?: string): string {
  const base = `/v1/vehicle-suppliers/suppliers/${encodeURIComponent(orgId)}/reports`;
  if (!reportId) return base;
  if (suffix) return `${base}/${encodeURIComponent(reportId)}/${suffix}`;
  return `${base}/${encodeURIComponent(reportId)}`;
}

function unwrapReport(payload: unknown): UberReportEntity | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (o.report && typeof o.report === "object") return o.report as UberReportEntity;
  if (o.data && typeof o.data === "object") return o.data as UberReportEntity;
  return o as UberReportEntity;
}

function isReportReady(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return (
    s === "REPORT_STATUS_COMPLETED" ||
    s.includes("COMPLETED") ||
    s.includes("SUCCESS") ||
    s === "READY"
  );
}

function isReportFailed(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === "REPORT_STATUS_FAILED" || s.includes("FAILED") || s.includes("ERROR");
}

function isRateLimited(message: string): boolean {
  return message.includes("429") || message.toLowerCase().includes("limit reached");
}

function extractSignedUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const data = o.data;
  if (data && typeof data === "object") {
    const value = (data as { value?: string }).value;
    if (value?.startsWith("http")) return value;
  }
  const signed = o.signedUrl;
  if (signed && typeof signed === "object") {
    const value = (signed as { value?: string }).value;
    if (value?.startsWith("http")) return value;
  }
  const value = o.value;
  if (typeof value === "string" && value.startsWith("http")) return value;
  return null;
}

function* chunkDateRange(from: Date, to: Date): Generator<{ from: Date; to: Date }> {
  let chunkEnd = new Date(to.getTime());
  const startBound = from.getTime();
  while (chunkEnd.getTime() > startBound) {
    const chunkStart = new Date(
      Math.max(startBound, chunkEnd.getTime() - MAX_REPORT_CHUNK_MS),
    );
    yield { from: chunkStart, to: chunkEnd };
    if (chunkStart.getTime() <= startBound) break;
    chunkEnd = new Date(chunkStart.getTime() - 1);
  }
}

async function generateUberReport(
  orgId: string,
  reportType: string,
  from: Date,
  to: Date,
): Promise<UberFleetResult<string>> {
  const body = {
    reportType,
    filters: [
      {
        field: "dateRange",
        operator: "OPERATOR_IN_RANGE",
        value: [String(from.getTime()), String(to.getTime())],
      },
    ],
  };

  const res = await uberFleetPost<unknown>(reportPath(orgId), body);
  if (!res.ok) return res;

  const report = unwrapReport(res.data);
  const id = report?.id;
  if (!id) {
    return { ok: false, message: `Generate ${reportType}: missing report id` };
  }
  return { ok: true, data: id };
}

async function waitForReportReady(
  orgId: string,
  reportId: string,
  maxAttempts = POLL_MAX_ATTEMPTS,
): Promise<UberFleetResult<void>> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const res = await uberFleetGet<unknown>(reportPath(orgId, reportId));
    if (!res.ok) return res;

    const report = unwrapReport(res.data);
    if (isReportReady(report?.status)) return { ok: true, data: undefined };
    if (isReportFailed(report?.status)) {
      return {
        ok: false,
        message: `Report failed: ${report?.failedReason ?? report?.status ?? "unknown"}`,
      };
    }

    await sleepWithSyncHeartbeat(POLL_INTERVAL_MS);
  }
  return { ok: false, message: "Report generation timed out" };
}

async function downloadReportCsv(orgId: string, reportId: string): Promise<UberFleetResult<string>> {
  const linkRes = await uberFleetPost<unknown>(reportPath(orgId, reportId, "link"), {});
  if (!linkRes.ok) return linkRes;

  const url = extractSignedUrl(linkRes.data);
  if (!url) {
    return { ok: false, message: "Create report link: missing signed URL" };
  }

  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    if (!res.ok) {
      const text = new TextDecoder().decode(buf.slice(0, 500));
      return { ok: false, message: `Report download ${res.status}: ${text.slice(0, 300)}` };
    }
    const head = new Uint8Array(buf.slice(0, 4));
    const isZip =
      contentType.includes("zip") ||
      (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04);
    if (isZip) {
      return {
        ok: false,
        message:
          "Report download is a ZIP (>10k rows). FleetHub currently supports single CSV only.",
      };
    }
    const text = new TextDecoder().decode(buf);
    return { ok: true, data: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

async function fetchUberReportRowsForChunk(
  orgId: string,
  reportType: string,
  from: Date,
  to: Date,
  pollMaxAttempts = POLL_MAX_ATTEMPTS,
): Promise<UberFleetResult<UberTripActivityRow[]>> {
  const gen = await generateUberReport(orgId, reportType, from, to);
  if (!gen.ok) return gen;

  const ready = await waitForReportReady(orgId, gen.data, pollMaxAttempts);
  if (!ready.ok) return ready;

  const csv = await downloadReportCsv(orgId, gen.data);
  if (!csv.ok) return csv;

  const parsed = parseCsv(csv.data);
  const rows = csvRowsToObjects(parsed);
  if (rows.length === 0) {
    const headers = parsed[0]?.join(", ") ?? "(empty file)";
    console.log(
      `[uber] ${reportType} ${gen.data.slice(0, 8)}… — 0 data rows; headers: ${headers.slice(0, 100)}`,
    );
  } else {
    console.log(`[uber] ${reportType} ${gen.data.slice(0, 8)}… — ${rows.length} row(s)`);
  }
  return { ok: true, data: rows };
}

async function fetchUberReportRows(
  orgId: string,
  reportType: string,
  from: Date,
  to: Date,
  pollMaxAttempts = POLL_MAX_ATTEMPTS,
  retryAttempt = 0,
): Promise<UberFleetResult<UberTripActivityRow[]>> {
  const cacheKey = reportRowsCacheKey(orgId, reportType, from, to);
  const dataCache =
    reportType === UBER_REPORT_TYPE_TRIP_ACTIVITY
      ? tripActivityDataCache
      : reportType === UBER_REPORT_TYPE_PAYMENTS_ORDER
        ? paymentsOrderDataCache
        : reportType === UBER_REPORT_TYPE_PAYMENTS_DRIVER
          ? paymentsDriverDataCache
          : null;
  const reuseMs =
    reportType === UBER_REPORT_TYPE_PAYMENTS_ORDER || reportType === UBER_REPORT_TYPE_PAYMENTS_DRIVER
      ? PAYMENTS_REPORT_REUSE_MS
      : TRIP_ACTIVITY_REUSE_MS;

  if (dataCache) {
    const reused = reusedReportRows(dataCache, cacheKey, reuseMs);
    if (reused) {
      console.log(`[uber] ${reportType} reused ${reused.length} cached row(s)`);
      return { ok: true, data: reused };
    }
  }

  const all: UberTripActivityRow[] = [];
  let rateLimitMessage: string | undefined;

  for (const chunk of chunkDateRange(from, to)) {
    const res = await fetchUberReportRowsForChunk(
      orgId,
      reportType,
      chunk.from,
      chunk.to,
      pollMaxAttempts,
    );
    if (!res.ok) {
      if (isRateLimited(res.message)) {
        rateLimitMessage = res.message;
      }
      continue;
    }
    all.push(...res.data);
  }

  if (rateLimitMessage && all.length === 0) {
    const isPaymentsReport =
      reportType === UBER_REPORT_TYPE_PAYMENTS_ORDER ||
      reportType === UBER_REPORT_TYPE_PAYMENTS_DRIVER;
    if (isPaymentsReport && retryAttempt < PAYMENTS_REPORT_MAX_RETRIES) {
      const waitMs = PAYMENTS_REPORT_RETRY_MS * (retryAttempt + 1);
      console.warn(
        `[uber] ${reportType} rate-limited — retry ${retryAttempt + 1}/${PAYMENTS_REPORT_MAX_RETRIES} in ${waitMs / 1000}s`,
      );
      await sleepWithSyncHeartbeat(waitMs);
      return fetchUberReportRows(
        orgId,
        reportType,
        from,
        to,
        pollMaxAttempts,
        retryAttempt + 1,
      );
    }
    if (dataCache) {
      const stale = dataCache.get(cacheKey);
      if (stale && stale.data.length > 0) {
        console.warn(
          `[uber] ${reportType} rate-limited — reusing stale cache (${stale.data.length} row(s))`,
        );
        return { ok: true, data: stale.data };
      }
    }
    return { ok: false, message: rateLimitMessage };
  }
  if (dataCache && all.length > 0) {
    storeReportRows(dataCache, cacheKey, all);
  }
  return { ok: true, data: all };
}

const tripActivityCache = new Map<string, Promise<UberFleetResult<UberTripActivityRow[]>>>();
const paymentsOrderCache = new Map<string, Promise<UberFleetResult<UberTripActivityRow[]>>>();
const paymentsDriverCache = new Map<string, Promise<UberFleetResult<UberTripActivityRow[]>>>();
let paymentsReportFormatLogged = false;

/** Drop cached payment reports so the next sync re-fetches amounts from Uber. */
export function invalidateUberPaymentsReportCache(
  orgId: string,
  from: Date,
  to: Date,
): void {
  const orderKey = reportRowsCacheKey(orgId, UBER_REPORT_TYPE_PAYMENTS_ORDER, from, to);
  const driverKey = reportRowsCacheKey(orgId, UBER_REPORT_TYPE_PAYMENTS_DRIVER, from, to);
  paymentsOrderDataCache.delete(orderKey);
  paymentsDriverDataCache.delete(driverKey);
  paymentsOrderCache.delete(`payments-order:${orgId}:${from.getTime()}:${to.getTime()}`);
  paymentsDriverCache.delete(`payments:${orgId}:${from.getTime()}:${to.getTime()}`);
}

/** Clears in-flight report request promises (end of sync job). Data cache survives across jobs. */
export function clearUberTripActivityCache(): void {
  tripActivityCache.clear();
  paymentsOrderCache.clear();
  paymentsDriverCache.clear();
  paymentsReportFormatLogged = false;
}

/** Warm org-level Uber reports once per sync job (shared across drivers in-process). */
export async function prefetchUberOrgReports(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<void> {
  const orgs = await resolveTenantUberOrgIds(tenantId);
  if (!orgs.ok) {
    console.warn("[uber] prefetch reports:", orgs.message);
    return;
  }

  for (let i = 0; i < orgs.data.length; i++) {
    if (i > 0) {
      console.log(
        `[uber] waiting ${REPORT_RATE_LIMIT_MS / 1000}s before next org report (rate limit)…`,
      );
      await sleepWithSyncHeartbeat(REPORT_RATE_LIMIT_MS);
    }
    const org = orgs.data[i]!;
    await fetchUberTripActivityRows(org.orgId, from, to);
    if (syncPaymentsOrderReport()) {
      await fetchUberPaymentsOrderRows(org.orgId, from, to);
    }
  }

  if (orgs.data.length > 1) {
    console.log(`[uber] prefetched reports for ${orgs.data.length} org(s).`);
  }
}

export async function fetchUberTripActivityRows(
  orgId: string,
  from: Date,
  to: Date,
): Promise<UberFleetResult<UberTripActivityRow[]>> {
  const key = `${orgId}:${from.getTime()}:${to.getTime()}`;

  let pending = tripActivityCache.get(key);
  if (!pending) {
    pending = fetchUberReportRows(orgId, UBER_REPORT_TYPE_TRIP_ACTIVITY, from, to);
    tripActivityCache.set(key, pending);
  }

  return pending;
}

export async function fetchUberPaymentsOrderRows(
  orgId: string,
  from: Date,
  to: Date,
): Promise<UberFleetResult<UberTripActivityRow[]>> {
  const key = `payments-order:${orgId}:${from.getTime()}:${to.getTime()}`;

  let pending = paymentsOrderCache.get(key);
  if (!pending) {
    pending = fetchUberReportRows(
      orgId,
      UBER_REPORT_TYPE_PAYMENTS_ORDER,
      from,
      to,
      PAYMENTS_POLL_MAX_ATTEMPTS,
    );
    paymentsOrderCache.set(key, pending);
  }

  return pending;
}

export async function fetchUberPaymentsDriverRows(
  orgId: string,
  from: Date,
  to: Date,
): Promise<UberFleetResult<UberTripActivityRow[]>> {
  const key = `payments:${orgId}:${from.getTime()}:${to.getTime()}`;

  let pending = paymentsDriverCache.get(key);
  if (!pending) {
    pending = fetchUberReportRows(
      orgId,
      UBER_REPORT_TYPE_PAYMENTS_DRIVER,
      from,
      to,
      PAYMENTS_POLL_MAX_ATTEMPTS,
    );
    paymentsDriverCache.set(key, pending);
  }

  return pending;
}

export async function fetchUberTripActivityTripsForDriver(args: {
  orgId: string;
  driverId: string;
  from: Date;
  to: Date;
}): Promise<UberFleetResult<NormalizedTripUpsert[]>> {
  const rows = await fetchUberTripActivityRows(args.orgId, args.from, args.to);
  if (!rows.ok) return rows;
  return {
    ok: true,
    data: filterTripActivityRows(rows.data, {
      driverId: args.driverId,
      from: args.from,
      to: args.to,
    }),
  };
}

/** Trip Activity for logistics, Payments Driver report for fare/fee/net (Spanish fleet exports). */
export async function syncUberTripsViaReports(args: {
  tenantId: string;
  driverId: string;
  driverPlatformAccountId?: string;
  from: Date;
  to: Date;
}): Promise<UberFleetResult<NormalizedTripUpsert[]>> {
  const orgsResult = await resolveTenantUberOrgIds(args.tenantId);
  if (!orgsResult.ok) return orgsResult;

  let preferredOrgId: string | null = null;
  if (args.driverPlatformAccountId) {
    const dpa = await withTenant(args.tenantId, (tx) =>
      tx.driverPlatformAccount.findFirst({
        where: { id: args.driverPlatformAccountId, platform: "UBER" },
        select: { metadata: true },
      }),
    );
    preferredOrgId = uberSyncOrgIdFromMetadata(dpa?.metadata);
  }

  const orgOrder = orderUberOrgIds(orgsResult.data, preferredOrgId);
  let trips: NormalizedTripUpsert[] = [];
  let usedOrg: UberOrgRef | null = null;

  async function tryActivityForOrg(org: UberOrgRef): Promise<NormalizedTripUpsert[]> {
    const activity = await fetchUberTripActivityRows(org.orgId, args.from, args.to);
    if (!activity.ok) {
      if (!isRateLimited(activity.message)) {
        console.warn(`[uber] trip activity (${org.orgName}):`, activity.message);
      }
      return [];
    }
    return filterTripActivityRows(activity.data, args);
  }

  async function tryPaymentsForOrg(org: UberOrgRef): Promise<NormalizedTripUpsert[]> {
    if (!syncPaymentsOrderReport()) return [];
    const orderPayments = await fetchUberPaymentsOrderRows(org.orgId, args.from, args.to);
    if (!orderPayments.ok || orderPayments.data.length === 0) return [];
    return filterPaymentsDriverRows(orderPayments.data, args);
  }

  const preferred = preferredOrgId ? orgOrder.find((o) => o.orgId === preferredOrgId) : undefined;
  const scanOrder = preferred
    ? [preferred, ...orgOrder.filter((o) => o.orgId !== preferred.orgId)]
    : orgOrder;

  for (let i = 0; i < scanOrder.length; i++) {
    const org = scanOrder[i]!;
    if (i > 0) {
      await sleepWithSyncHeartbeat(REPORT_RATE_LIMIT_MS);
    }
    const filtered = await tryActivityForOrg(org);
    if (filtered.length > 0) {
      trips = filtered;
      usedOrg = org;
      break;
    }
  }

  if (trips.length === 0) {
    for (let i = 0; i < scanOrder.length; i++) {
      const org = scanOrder[i]!;
      if (i > 0) {
        await sleepWithSyncHeartbeat(REPORT_RATE_LIMIT_MS);
      }
      const paymentTrips = await tryPaymentsForOrg(org);
      if (paymentTrips.length > 0) {
        trips = paymentTrips;
        usedOrg = org;
        console.log(
          `[uber] payments order (${org.orgName}) → ${paymentTrips.length} trip row(s) for driver ${args.driverId.slice(0, 8)}…`,
        );
        break;
      }
    }
  }

  const paymentsOrg = usedOrg ?? scanOrder[0]!;

  if (
    usedOrg &&
    (syncPaymentsOrderReport() || syncPaymentsDriverReport()) &&
    trips.length > 0 &&
    syncPaymentsOrderReport()
  ) {
    const orderCacheKey = `payments-order:${paymentsOrg.orgId}:${args.from.getTime()}:${args.to.getTime()}`;
    const driverCacheKey = `payments:${paymentsOrg.orgId}:${args.from.getTime()}:${args.to.getTime()}`;
    const needsRateLimitWait =
      !paymentsOrderCache.has(orderCacheKey) && !paymentsDriverCache.has(driverCacheKey);
    if (needsRateLimitWait) {
      console.log(
        `[uber] waiting ${REPORT_RATE_LIMIT_MS / 1000}s before payments enrich (rate limit)…`,
      );
      await sleepWithSyncHeartbeat(REPORT_RATE_LIMIT_MS);
    }

    const orderPayments = await fetchUberPaymentsOrderRows(
      paymentsOrg.orgId,
      args.from,
      args.to,
    );
    if (orderPayments.ok && orderPayments.data.length > 0) {
      const paymentTrips = filterPaymentsDriverRows(orderPayments.data, args);
      if (paymentTrips.length > 0) {
        trips = mergeUberDriverTripUpserts(trips, paymentTrips);
        console.log(
          `[uber] payments order enrich (${paymentsOrg.orgName}) → ${paymentTrips.length} trip row(s), ${countTripsWithAmounts(trips)} with amounts for driver ${args.driverId.slice(0, 8)}…`,
        );
      }
    } else if (!orderPayments.ok) {
      console.warn("[uber] payments order report:", orderPayments.message);
    }
  }

  if (
    syncPaymentsDriverReport() &&
    usedOrg &&
    trips.length > 0 &&
    tripsInWindowMissingAmounts(trips, args.from, args.to)
  ) {
    const payments = await fetchUberPaymentsDriverRows(paymentsOrg.orgId, args.from, args.to);
    if (payments.ok && payments.data.length > 0) {
      if (!paymentsReportFormatLogged) {
        paymentsReportFormatLogged = true;
        const tripLevel = paymentsDriverReportIsTripLevel(payments.data);
        console.log(
          `[uber] payments driver report format: ${tripLevel ? "trip-level" : "driver summary (no per-trip UUID)"}`,
        );
        if (!tripLevel) {
          console.warn(
            "[uber] payments driver CSV has no trip UUID — use REPORT_TYPE_PAYMENTS_ORDER for per-trip amounts.",
          );
        }
      }

      const paymentTrips = filterPaymentsDriverRows(payments.data, args);
      if (paymentTrips.length > 0) {
        trips = mergeUberDriverTripUpserts(trips, paymentTrips);
        console.log(
          `[uber] payments driver report → ${paymentTrips.length} trip row(s), ${countTripsWithAmounts(trips)} with amounts for driver ${args.driverId.slice(0, 8)}…`,
        );
      }
    } else if (!payments.ok) {
      console.warn("[uber] payments driver report:", payments.message);
    }
  }

  if (
    usedOrg &&
    args.driverPlatformAccountId &&
    trips.length > 0 &&
    usedOrg.orgId !== preferredOrgId
  ) {
    await persistDriverUberSyncOrgId(args.tenantId, args.driverPlatformAccountId, usedOrg);
  }

  if (trips.length === 0) {
    const orgLabel =
      scanOrder.length > 1 ? `${scanOrder.length} org(s)` : (scanOrder[0]?.orgName ?? "org");
    console.log(
      `[uber] no trips for driver ${args.driverId.slice(0, 8)}… in ${args.from.toISOString().slice(0, 10)}–${args.to.toISOString().slice(0, 10)} (${orgLabel}: no completed trips in Uber reports / payments API window)`,
    );
  } else if (usedOrg && scanOrder.length > 1) {
    console.log(`[uber] driver ${args.driverId.slice(0, 8)}… trips from org ${usedOrg.orgName}`);
  }

  return { ok: true, data: trips };
}
