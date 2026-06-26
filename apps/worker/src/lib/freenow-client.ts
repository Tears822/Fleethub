/**
 * FreeNow Meta-Account API — all data calls go through `@api/freenow` SDK.
 */
import type {
  GetCompanyDriversPaginatedMetadataParam,
  GetCompanyEarningsMetadataParam,
  GetCompanyEarningsResponse200,
  GetDriverEarningsMetadataParam,
  GetDriverEarningsResponse200,
} from "@api/freenow";
import { resolveFreenowNumericCompanyId } from "./freenow-company-id.js";
import { resolveFreenowNumericDriverId } from "./freenow-driver-id.js";

export { resolveFreenowNumericCompanyId } from "./freenow-company-id.js";
export { resolveFreenowNumericDriverId } from "./freenow-driver-id.js";
import { freenowSdkCall, getFreenowSdk } from "./freenow-sdk.js";
import { resolveFreenowAuthMode } from "./freenow-env.js";
import { getFreenowAccessToken, clearFreenowTokenCache } from "./freenow-token.js";

export type { FreenowTokenMeta } from "./freenow-token.js";
export { getFreenowAccessToken, clearFreenowTokenCache };

export type FreenowLinkedCompany = {
  id: string;
  companyName: string;
  /** @deprecated use companyName */
  name?: string;
};

export type FreenowDriverStatus = "ACTIVE" | "PENDING" | "ABUSE";

/** Driver row from `getCompanyDriversPaginated` — `id` is the public driver id (e.g. GYZDOMBRHEZDQ), not int64 `driverId` for earnings. */
export type FreenowDriver = {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
};

export type FreenowDriversPage = {
  drivers: FreenowDriver[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalElements: number;
};

export type FreenowEarningsReport = GetCompanyEarningsResponse200;

export type FreenowCompanyEarningsParams = {
  publicCompanyId: string;
  from: Date;
  to: Date;
};

export type FreenowDriverEarningsParams = {
  publicCompanyId: string;
  publicDriverId: string;
  from: Date;
  to: Date;
};

/** Tour count from company or driver earnings (`grossValues.tours.numberOfTours`). */
export function freenowEarningsNumberOfTours(report: {
  grossValues?: { tours?: { numberOfTours?: number } };
}): number {
  const n = report.grossValues?.tours?.numberOfTours;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Optional legacy numeric query ids; omitted unless env maps are set. */
export function freenowDriverEarningsQueryIds(
  publicCompanyId: string,
  publicDriverId: string,
): { companyId?: number; driverId?: number } {
  return {
    companyId: resolveFreenowNumericCompanyId(publicCompanyId),
    driverId: resolveFreenowNumericDriverId(publicDriverId),
  };
}

export function freenowLinkedCompanyName(company: FreenowLinkedCompany): string {
  return company.companyName?.trim() || company.name?.trim() || "";
}

export function freenowPublicDriverId(driver: Partial<FreenowDriver>): string | undefined {
  const id = driver.id ?? (driver as { publicDriverId?: string }).publicDriverId;
  return id != null && String(id).length > 0 ? String(id) : undefined;
}

export function freenowDriverDisplayName(driver: Partial<FreenowDriver>): string {
  if (driver.name && String(driver.name).trim()) return String(driver.name).trim();
  return "";
}

export function freenowPublicCompanyId(company: { id?: string; publicCompanyId?: string }): string | undefined {
  const id = company.id ?? company.publicCompanyId;
  return id != null && String(id).length > 0 ? String(id) : undefined;
}

export async function listFreenowLinkedCompanies(params?: {
  page?: number;
  size?: number;
}): Promise<
  | { ok: true; status: number; companies: FreenowLinkedCompany[]; raw: unknown }
  | { ok: false; message: string }
> {
  const page = params?.page ?? 0;
  const size = params?.size ?? 25;

  const result = await freenowSdkCall("getLinkedCompanies", (sdk) =>
    sdk.getLinkedCompanies({ page, size }),
  );
  if (!result.ok) {
    return result;
  }

  const companies = (result.data.content ?? []).map((c) => ({
    id: c.id,
    companyName: c.companyName,
    name: c.companyName,
  }));

  return { ok: true, status: result.status, companies, raw: result.data };
}

export async function listFreenowCompanyDrivers(
  publicCompanyId: string,
  params?: { page?: number; size?: number; status?: FreenowDriverStatus },
): Promise<
  | { ok: true; status: number; page: FreenowDriversPage; raw: unknown }
  | { ok: false; message: string }
> {
  const page = params?.page ?? 0;
  const size = params?.size ?? 20;
  const status = params?.status ?? "ACTIVE";
  const companyId = resolveFreenowNumericCompanyId(publicCompanyId);

  const result = await freenowSdkCall("getCompanyDriversPaginated", (sdk) => {
    const meta = {
      publicCompanyId,
      page,
      size,
      status,
      ...(companyId != null ? { companyId } : {}),
    } as GetCompanyDriversPaginatedMetadataParam;
    return sdk.getCompanyDriversPaginated(meta);
  });
  if (!result.ok) {
    return result;
  }

  const meta = result.data.metadata;
  const pageData: FreenowDriversPage = {
    drivers: (result.data.content ?? []).map((d) => ({ id: d.id, name: d.name })),
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? size,
    totalPages: meta?.totalPages ?? 1,
    totalElements: meta?.totalElements ?? 0,
  };

  return { ok: true, status: result.status, page: pageData, raw: result.data };
}

export async function listAllFreenowCompanyDrivers(
  publicCompanyId: string,
  options?: { status?: FreenowDriverStatus; pageSize?: number },
): Promise<{ ok: true; drivers: FreenowDriver[] } | { ok: false; message: string }> {
  const pageSize = options?.pageSize ?? 20;
  const status = options?.status ?? "ACTIVE";
  const all: FreenowDriver[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const batch = await listFreenowCompanyDrivers(publicCompanyId, { page, size: pageSize, status });
    if (!batch.ok) {
      return batch;
    }
    all.push(...batch.page.drivers);
    totalPages = batch.page.totalPages;
    page += 1;
    if (batch.page.drivers.length === 0) break;
  }

  return { ok: true, drivers: all };
}

export async function getFreenowCompanyEarnings(
  params: FreenowCompanyEarningsParams,
): Promise<
  | { ok: true; status: number; data: FreenowEarningsReport }
  | { ok: false; message: string }
> {
  const { publicCompanyId, from, to } = params;
  const companyId = resolveFreenowNumericCompanyId(publicCompanyId);

  const result = await freenowSdkCall("getCompanyEarnings", (sdk) => {
    const meta = {
      publicCompanyId,
      from: from.toISOString(),
      to: to.toISOString(),
      ...(companyId != null ? { companyId } : {}),
    } as GetCompanyEarningsMetadataParam;
    return sdk.getCompanyEarnings(meta);
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, status: result.status, data: result.data };
}

export async function getFreenowDriverEarnings(
  params: FreenowDriverEarningsParams,
): Promise<
  | { ok: true; status: number; data: GetDriverEarningsResponse200 }
  | { ok: false; message: string }
> {
  const { publicCompanyId, publicDriverId, from, to } = params;
  const { companyId, driverId } = freenowDriverEarningsQueryIds(publicCompanyId, publicDriverId);

  const result = await freenowSdkCall("getDriverEarnings", (sdk) => {
    const meta = {
      publicCompanyId,
      publicDriverId,
      from: from.toISOString(),
      to: to.toISOString(),
      ...(companyId != null ? { companyId } : {}),
      ...(driverId != null ? { driverId } : {}),
    } as GetDriverEarningsMetadataParam;
    return sdk.getDriverEarnings(meta);
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, status: result.status, data: result.data };
}

export async function probeFreenowApi(): Promise<
  { ok: true; scope?: string; expiresIn?: number; authMode: string } | { ok: false; message: string }
> {
  const token = await getFreenowAccessToken(true);
  if (!token.ok) {
    return { ok: false, message: token.message };
  }
  const sdk = await getFreenowSdk(true);
  if (!sdk.ok) {
    return { ok: false, message: sdk.message };
  }
  return {
    ok: true,
    scope: token.meta.scope,
    expiresIn: token.meta.expiresIn,
    authMode: resolveFreenowAuthMode(),
  };
}
