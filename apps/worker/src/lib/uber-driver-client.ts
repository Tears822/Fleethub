import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { uberDriverEnv } from "./uber-driver-env.js";

export type UberDriverApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type UberPartnerProfile = {
  driver_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  activation_status?: string;
};

export type UberPartnerTrip = {
  trip_id?: string;
  driver_id?: string;
  vehicle_id?: string;
  fare?: number;
  currency_code?: string;
  status?: string;
  duration?: number;
  distance?: number;
  pickup?: { timestamp?: number };
  dropoff?: { timestamp?: number };
  drop_off?: { timestamp?: number };
  status_changes?: Array<{ status?: string; timestamp?: number }>;
  breakdown?: { toll?: number; service_fee?: number; other?: number };
};

export type UberPartnerPayment = {
  payment_id?: string;
  category?: string;
  amount?: number;
  cash_collected?: number;
  currency_code?: string;
  driver_id?: string;
  event_time?: number;
  trip_id?: string | null;
  partner_id?: string;
  breakdown?: { toll?: number; service_fee?: number; other?: number };
  rider_fees?: { split_fare?: number };
};

type PaginatedTrips = {
  count?: number;
  limit?: number;
  offset?: number;
  trips?: UberPartnerTrip[];
};

type PaginatedPayments = {
  count?: number;
  limit?: number;
  offset?: number;
  payments?: UberPartnerPayment[];
};

const PAYMENTS_MAX_RANGE_SEC = 10 * 24 * 60 * 60;

async function driverApiGet<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string | number | undefined>,
): Promise<UberDriverApiResult<T>> {
  const env = uberDriverEnv();
  const url = new URL(path, `${env.apiBaseUrl.replace(/\/$/, "")}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `Driver API ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function exchangeUberDriverAuthCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl?: string;
}): Promise<UberDriverApiResult<{ accessToken: string; refreshToken?: string; scope?: string }>> {
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      code: args.code,
    });
    const res = await fetch(args.tokenUrl ?? "https://auth.uber.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `Token exchange ${res.status}: ${text.slice(0, 500)}` };
    }
    const json = JSON.parse(text) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
    };
    if (!json.access_token) {
      return { ok: false, message: "Token response missing access_token" };
    }
    return {
      ok: true,
      data: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        scope: json.scope,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function refreshUberDriverToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
}): Promise<UberDriverApiResult<{ accessToken: string; refreshToken?: string }>> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
    });
    const res = await fetch(args.tokenUrl ?? "https://auth.uber.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `Refresh ${res.status}: ${text.slice(0, 500)}` };
    }
    const json = JSON.parse(text) as { access_token?: string; refresh_token?: string };
    if (!json.access_token) {
      return { ok: false, message: "Refresh response missing access_token" };
    }
    return {
      ok: true,
      data: { accessToken: json.access_token, refreshToken: json.refresh_token },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/** GET /v1/partners/me — driver OAuth token required (scope partner.accounts). */
export async function getUberPartnerProfile(
  accessToken: string,
): Promise<UberDriverApiResult<UberPartnerProfile>> {
  return driverApiGet<UberPartnerProfile>("/v1/partners/me", accessToken);
}

/** GET /v1/partners/trips — one page (scope partner.trips). */
export async function getUberPartnerTripsPage(
  accessToken: string,
  query: {
    offset?: number;
    limit?: number;
    from_time?: number;
    to_time?: number;
  },
): Promise<UberDriverApiResult<PaginatedTrips>> {
  return driverApiGet<PaginatedTrips>("/v1/partners/trips", accessToken, {
    offset: query.offset ?? 0,
    limit: query.limit ?? 50,
    from_time: query.from_time,
    to_time: query.to_time,
  });
}

/** GET /v1/partners/payments — one page (max 10-day window per request). */
export async function getUberPartnerPaymentsPage(
  accessToken: string,
  query: {
    offset?: number;
    limit?: number;
    from_time?: number;
    to_time?: number;
  },
): Promise<UberDriverApiResult<PaginatedPayments>> {
  return driverApiGet<PaginatedPayments>("/v1/partners/payments", accessToken, {
    offset: query.offset ?? 0,
    limit: query.limit ?? 50,
    from_time: query.from_time,
    to_time: query.to_time,
  });
}

function* chunkUnixRange(
  fromSec: number,
  toSec: number,
  maxSpanSec: number,
): Generator<{ from_time: number; to_time: number }> {
  let end = toSec;
  while (end > fromSec) {
    const start = Math.max(fromSec, end - maxSpanSec);
    yield { from_time: start, to_time: end };
    if (start <= fromSec) break;
    end = start - 1;
  }
}

/** All trips in range (paginated, limit 50). */
export async function fetchAllUberPartnerTrips(
  accessToken: string,
  range: { from_time: number; to_time: number },
): Promise<UberDriverApiResult<UberPartnerTrip[]>> {
  const all: UberPartnerTrip[] = [];
  const limit = 50;
  let offset = 0;

  for (let page = 0; page < 200; page += 1) {
    const res = await getUberPartnerTripsPage(accessToken, {
      ...range,
      offset,
      limit,
    });
    if (!res.ok) return res;

    const batch = res.data.trips ?? [];
    all.push(...batch);
    const total = res.data.count ?? all.length;
    offset += batch.length;
    if (batch.length < limit || offset >= total) break;
  }

  return { ok: true, data: all };
}

/** All payments in range (10-day chunks + pagination). */
export async function fetchAllUberPartnerPayments(
  accessToken: string,
  range: { from_time: number; to_time: number },
): Promise<UberDriverApiResult<UberPartnerPayment[]>> {
  const all: UberPartnerPayment[] = [];

  for (const chunk of chunkUnixRange(range.from_time, range.to_time, PAYMENTS_MAX_RANGE_SEC)) {
    const limit = 50;
    let offset = 0;

    for (let page = 0; page < 200; page += 1) {
      const res = await getUberPartnerPaymentsPage(accessToken, {
        ...chunk,
        offset,
        limit,
      });
      if (!res.ok) return res;

      const batch = res.data.payments ?? [];
      all.push(...batch);
      const total = res.data.count ?? all.length;
      offset += batch.length;
      if (batch.length < limit || offset >= total) break;
    }
  }

  return { ok: true, data: all };
}

export function uberPartnerDisplayName(profile: UberPartnerProfile): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
}

export async function resolveUberDriverAccessToken(): Promise<UberDriverApiResult<string>> {
  const env = uberDriverEnv();

  if (env.accessToken) {
    return { ok: true, data: env.accessToken };
  }

  if (env.authCode && env.clientId && env.clientSecret && env.redirectUri) {
    const exchanged = await exchangeUberDriverAuthCode({
      code: env.authCode,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri: env.redirectUri,
      tokenUrl: env.tokenUrl,
    });
    if (!exchanged.ok) return exchanged;
    return { ok: true, data: exchanged.data.accessToken };
  }

  if (env.refreshToken && env.clientId && env.clientSecret) {
    const refreshed = await refreshUberDriverToken({
      refreshToken: env.refreshToken,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      tokenUrl: env.tokenUrl,
    });
    if (!refreshed.ok) return refreshed;
    return { ok: true, data: refreshed.data.accessToken };
  }

  return {
    ok: false,
    message:
      "Set UBER_DRIVER_ACCESS_TOKEN, or UBER_DRIVER_AUTH_CODE + redirect URI, or UBER_DRIVER_REFRESH_TOKEN",
  };
}
