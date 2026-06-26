/**
 * ReadMe-generated Meta-Account SDK (`@api/freenow`).
 * Generate/update: `npm run freenow:sdk -w @fleethub/worker`
 */
import freenowImport from "@api/freenow";
import type { GetCompanyBookingsResponse200 } from "@api/freenow";
import type { FetchResponse } from "api/dist/core";
import { getFreenowAccessToken, clearFreenowTokenCache } from "./freenow-token.js";
import { freenowEnv } from "./freenow-env.js";

export { clearFreenowTokenCache };

type SdkInstance = typeof freenowImport extends { default: infer D }
  ? D extends { server: (url: string) => void }
    ? D
    : typeof freenowImport
  : typeof freenowImport;

function resolveFreenowSdkModule(): SdkInstance {
  const mod = freenowImport as SdkInstance & { default?: SdkInstance };
  if (typeof mod.server === "function") {
    return mod;
  }
  if (mod.default && typeof mod.default.server === "function") {
    return mod.default;
  }
  throw new Error("@api/freenow SDK instance not found (unexpected module shape)");
}

const freenowSdk = resolveFreenowSdkModule();

export type FreenowSdk = SdkInstance;

export function freenowGatewayServerUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/api")) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

let sdkConfigured = false;
let sdkTokenExpiresAtMs = 0;

export async function getFreenowSdk(forceRefresh = false): Promise<
  { ok: true; sdk: FreenowSdk } | { ok: false; message: string }
> {
  const now = Date.now();
  if (!forceRefresh && sdkConfigured && sdkTokenExpiresAtMs > now + 60_000) {
    return { ok: true, sdk: freenowSdk };
  }

  const token = await getFreenowAccessToken(forceRefresh);
  if (!token.ok) {
    return { ok: false, message: token.message };
  }

  const env = freenowEnv();
  freenowSdk.server(freenowGatewayServerUrl(env.apiBaseUrl));
  freenowSdk.auth(token.meta.accessToken);

  sdkConfigured = true;
  sdkTokenExpiresAtMs =
    now + (token.meta.expiresIn != null ? token.meta.expiresIn * 1000 : 30 * 60 * 1000);

  return { ok: true, sdk: freenowSdk };
}

export function unwrapSdkData<T>(res: { data?: T; status: number; res: Response }): T {
  if (res.data !== undefined) {
    return res.data;
  }
  throw new Error(`FreeNow SDK empty body (HTTP ${res.status})`);
}

export async function freenowSdkCall<T>(
  label: string,
  call: (sdk: FreenowSdk) => Promise<FetchResponse<200, T>>,
): Promise<{ ok: true; status: number; data: T } | { ok: false; message: string }> {
  const sdkResult = await getFreenowSdk();
  if (!sdkResult.ok) {
    return sdkResult;
  }
  try {
    const res = await call(sdkResult.sdk);
    if (res.status !== 200) {
      const body = await res.res.text().catch(() => "");
      return {
        ok: false,
        message: `${label} HTTP ${res.status}: ${body.slice(0, 400)}`,
      };
    }
    return { ok: true, status: res.status, data: unwrapSdkData(res) };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const msg = err.message ?? (e instanceof Error ? e.message : String(e));
    if (err.status != null) {
      return { ok: false, message: `${label} HTTP ${err.status}: ${msg}` };
    }
    return { ok: false, message: `${label}: ${msg}` };
  }
}

export type FreenowBooking = GetCompanyBookingsResponse200["content"][number];
