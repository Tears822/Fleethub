import { fetchClientCredentialsToken } from "./oauth-client-credentials.js";
import { findUberOrgForTenant, type UberOrgRef } from "./uber-tenant-org-map.js";
import { uberFleetEnv } from "./uber-fleet-env.js";

type TokenCache = { accessToken: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

export type UberFleetResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type UberOrganization = {
  id: string;
  name?: string;
  parent_org_id?: string;
  types?: string[];
};

/** Normalized driver row (Uber API uses camelCase in `driverInformation`). */
export type UberDriverRow = {
  driverId?: string;
  driverIdEncrypted?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  /** Legacy / alternate shapes */
  driver_id?: string;
  uuid?: string;
  first_name?: string;
  last_name?: string;
};

export type UberPaymentRow = {
  trip_id?: string | null;
  payment_id?: string;
  driver_id?: string;
  amount?: number;
  event_time?: number;
  category?: string;
  currency_code?: string;
};

type UberDriversApiPage = {
  driverInformation?: UberDriverRow[];
  drivers?: UberDriverRow[];
  paginationResult?: { nextPageToken?: string | null };
};

type UberPaymentsApiBody = {
  earnerPaymentBreakdowns?: Array<{
    earnerInfo?: { uuid?: string; firstName?: string; lastName?: string };
    paymentBreakdowns?: Array<{
      categoryName?: string;
      amount?: { amountE5?: number; currencyCode?: string };
    }>;
  }>;
  payments?: UberPaymentRow[];
  paginationResult?: { nextPageToken?: string | null };
};

type UberPaymentsApiResponse = UberPaymentsApiBody & {
  body?: UberPaymentsApiBody;
};

/** Client credentials token (same flow as Uber Developer → Access Token playground). */
export async function getUberFleetAccessToken(): Promise<UberFleetResult<string>> {
  const env = uberFleetEnv();
  if (!env.clientId || !env.clientSecret) {
    return { ok: false, message: "Missing UBER_CLIENT_ID / UBER_CLIENT_SECRET" };
  }

  if (tokenCache && tokenCache.expiresAtMs > Date.now() + 60_000) {
    return { ok: true, data: tokenCache.accessToken };
  }

  const token = await fetchClientCredentialsToken({
    tokenUrl: env.tokenUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    scope: env.scope,
  });
  if (!token.ok) {
    return { ok: false, message: token.message };
  }

  tokenCache = {
    accessToken: token.accessToken,
    expiresAtMs: Date.now() + 29 * 24 * 60 * 60 * 1000,
  };
  return { ok: true, data: token.accessToken };
}

export function clearUberFleetTokenCache(): void {
  tokenCache = null;
}

export async function uberFleetGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<UberFleetResult<T>> {
  return uberGet<T>(path, query);
}

export async function uberFleetPost<T>(path: string, body: unknown): Promise<UberFleetResult<T>> {
  const token = await getUberFleetAccessToken();
  if (!token.ok) return token;

  const env = uberFleetEnv();
  const url = new URL(path, `${env.apiBaseUrl.replace(/\/$/, "")}/`);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.data}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `Uber ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

async function uberGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<
  UberFleetResult<T>
> {
  const token = await getUberFleetAccessToken();
  if (!token.ok) return token;

  const env = uberFleetEnv();
  const url = new URL(path, `${env.apiBaseUrl.replace(/\/$/, "")}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token.data}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `Uber ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/** GET /v1/vehicle-suppliers/orgs — scope vehicle_suppliers.organizations.read */
export async function listUberOrganizations(): Promise<UberFleetResult<UberOrganization[]>> {
  const res = await uberGet<{ organizations?: UberOrganization[] }>("/v1/vehicle-suppliers/orgs");
  if (!res.ok) return res;
  return { ok: true, data: res.data.organizations ?? [] };
}

/** Resolve Uber sub-org for a tenant slug (API name match, then baked-in map / env). */
export async function resolveUberOrgForTenantSlug(
  tenantSlug: string,
): Promise<UberFleetResult<UberOrgRef>> {
  const orgs = await listUberOrganizations();
  if (orgs.ok) {
    const found = findUberOrgForTenant(
      orgs.data.map((o) => ({ id: o.id, name: o.name ?? null })),
      tenantSlug,
    );
    if (found) return { ok: true, data: found };
  }

  const preset = findUberOrgForTenant([], tenantSlug);
  if (preset) return { ok: true, data: preset };

  const env = uberFleetEnv();
  if (env.orgId) {
    return { ok: true, data: { orgId: env.orgId, orgName: tenantSlug } };
  }

  return orgs.ok === false
    ? orgs
    : { ok: false, message: `No Uber org mapping for tenant slug "${tenantSlug}"` };
}

export async function resolveUberOrgId(tenantOrgIdOverride?: string): Promise<UberFleetResult<string>> {
  const override = tenantOrgIdOverride?.trim();
  if (override) return { ok: true, data: override };

  const env = uberFleetEnv();
  if (env.orgId) return { ok: true, data: env.orgId };

  const orgs = await listUberOrganizations();
  if (!orgs.ok) return orgs;
  if (orgs.data.length === 0) {
    return { ok: false, message: "No organizations returned — set UBER_ORG_ID from GET /v1/vehicle-suppliers/orgs" };
  }
  const preferred =
    orgs.data.find((o) => o.types?.includes("DRIVER_BUSINESS")) ?? orgs.data[0]!;
  return { ok: true, data: preferred.id };
}

function parseUberDriversPage(payload: UberDriversApiPage): UberDriverRow[] {
  return payload.driverInformation ?? payload.drivers ?? [];
}

function nextUberPageToken(payload: { paginationResult?: { nextPageToken?: string | null } }): string | undefined {
  const token = payload.paginationResult?.nextPageToken;
  if (!token || typeof token !== "string" || token.trim() === "") return undefined;
  return token.trim();
}

/** Raw driver UUID for payments filter; prefer unencrypted `driverId`. */
export function uberDriverExternalId(row: UberDriverRow): string | undefined {
  const id = row.driverId ?? row.driver_id ?? row.uuid;
  return id?.trim() || undefined;
}

export function uberDriverDisplayName(row: UberDriverRow): string {
  const first = (row.firstName ?? row.first_name ?? "").trim();
  const last = (row.lastName ?? row.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

/** GET /v1/vehicle-suppliers/drivers — scope solutions.suppliers.drivers.status.read */
export async function listUberDrivers(
  orgId: string,
  pageSize = 50,
  pageToken?: string,
): Promise<UberFleetResult<UberDriverRow[]>> {
  const res = await uberGet<UberDriversApiPage>("/v1/vehicle-suppliers/drivers", {
    org_id: orgId,
    page_size: pageSize,
    page_token: pageToken,
  });
  if (!res.ok) return res;
  return { ok: true, data: parseUberDriversPage(res.data) };
}

type UberDriverActionsPage = {
  driverStatusOverviews?: Array<{
    driverInfo?: { driverUuid?: string };
    statusEntries?: Array<{ status?: string; supplyStatus?: string }> | null;
  }>;
  paginationResult?: { nextPageToken?: string | null };
};

function nextActionsPageToken(payload: UberDriverActionsPage): string | undefined {
  const token = payload.paginationResult?.nextPageToken;
  if (!token || typeof token !== "string" || token.trim() === "") return undefined;
  return token.trim();
}

function realtimeStatusFromOverview(
  overview: NonNullable<UberDriverActionsPage["driverStatusOverviews"]>[number],
): string | undefined {
  const entries = overview.statusEntries;
  if (!entries?.length) return undefined;
  const latest = entries[entries.length - 1]!;
  return latest.status ?? latest.supplyStatus;
}

/** GET /v1/vehicle-suppliers/drivers/actions — realtime online/trip status per driver. */
export async function listAllUberDriverRealtimeStatuses(
  orgId: string,
): Promise<UberFleetResult<Map<string, string | undefined>>> {
  const map = new Map<string, string | undefined>();
  let pageToken: string | undefined;

  for (let page = 0; page < 50; page += 1) {
    const res = await uberGet<UberDriverActionsPage>("/v1/vehicle-suppliers/drivers/actions", {
      org_id: orgId,
      page_size: 100,
      page_token: pageToken,
    });
    if (!res.ok) return res;

    for (const overview of res.data.driverStatusOverviews ?? []) {
      const uuid = overview.driverInfo?.driverUuid?.trim();
      if (!uuid) continue;
      map.set(uuid, realtimeStatusFromOverview(overview));
    }

    pageToken = nextActionsPageToken(res.data);
    if (!pageToken) break;
  }

  return { ok: true, data: map };
}

/** All drivers for an org (follows paginationResult.nextPageToken). */
export async function listAllUberDrivers(orgId: string): Promise<UberFleetResult<UberDriverRow[]>> {
  const all: UberDriverRow[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 50; page += 1) {
    const res = await uberGet<UberDriversApiPage>("/v1/vehicle-suppliers/drivers", {
      org_id: orgId,
      page_size: 100,
      page_token: pageToken,
    });
    if (!res.ok) return res;
    all.push(...parseUberDriversPage(res.data));
    pageToken = nextUberPageToken(res.data);
    if (!pageToken) break;
  }

  return { ok: true, data: all };
}

/**
 * GET /v1/vehicle-suppliers/earners/payments — scope supplier.partner.payments
 * Uber only returns payments in roughly the last 24 hours.
 */
function flattenUberPaymentsPayload(body: UberPaymentsApiBody): UberPaymentRow[] {
  if (body.payments?.length) return body.payments;

  const rows: UberPaymentRow[] = [];
  for (const block of body.earnerPaymentBreakdowns ?? []) {
    const driverId = block.earnerInfo?.uuid;
    for (const breakdown of block.paymentBreakdowns ?? []) {
      const amountE5 = breakdown.amount?.amountE5;
      rows.push({
        driver_id: driverId,
        amount: amountE5 != null ? amountE5 / 100_000 : undefined,
        category: breakdown.categoryName,
        currency_code: breakdown.amount?.currencyCode,
      });
    }
  }
  return rows;
}

export async function fetchUberDriverPayments(args: {
  orgId: string;
  startTimeMs: number;
  endTimeMs: number;
  driverId?: string;
  pageSize?: number;
}): Promise<UberFleetResult<UberPaymentRow[]>> {
  const all: UberPaymentRow[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const res = await uberGet<UberPaymentsApiResponse>("/v1/vehicle-suppliers/earners/payments", {
      org_id: args.orgId,
      start_time: args.startTimeMs,
      end_time: args.endTimeMs,
      driver_id: args.driverId,
      page_size: args.pageSize ?? 100,
      page_token: pageToken,
    });
    if (!res.ok) return res;

    const body = res.data.body ?? res.data;
    all.push(...flattenUberPaymentsPayload(body));
    pageToken = nextUberPageToken(body);
    if (!pageToken) break;
  }

  return { ok: true, data: all };
}

/** Probe API after token — used by verifyConnection. */
export async function probeUberFleetApi(): Promise<
  UberFleetResult<{ orgId: string; orgCount: number; driverCount: number }>
> {
  const token = await getUberFleetAccessToken();
  if (!token.ok) return token;

  const orgs = await listUberOrganizations();
  if (!orgs.ok) return orgs;

  const orgId = await resolveUberOrgId();
  if (!orgId.ok) return orgId;

  const drivers = await listAllUberDrivers(orgId.data);
  if (!drivers.ok) return drivers;

  return {
    ok: true,
    data: { orgId: orgId.data, orgCount: orgs.data.length, driverCount: drivers.data.length },
  };
}
