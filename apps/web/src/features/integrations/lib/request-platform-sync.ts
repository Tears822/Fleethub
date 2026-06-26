import type { SyncRunDto } from "@/features/integrations/lib/sync-run-status";
import { buildApiUrl } from "@/shared/lib/api-url";

export type PlatformSyncPollOptions = {
  platform?: "UBER" | "FREENOW" | "BOLT" | "CABIFY";
  all?: boolean;
};

export type PlatformSyncPollResult = {
  ok: boolean;
  status: number;
  message?: string;
  error?: string;
  queueUnavailable?: boolean;
};

export async function fetchSyncRuns(limit = 20): Promise<SyncRunDto[]> {
  const res = await fetch(buildApiUrl(`/api/tenant/sync/runs?limit=${limit}`), {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { runs?: SyncRunDto[] };
  return data.runs ?? [];
}

export async function requestPlatformSyncPoll(
  options: PlatformSyncPollOptions = {},
): Promise<PlatformSyncPollResult> {
  const res = await fetch(buildApiUrl("/api/tenant/sync/poll"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const data = (await res.json()) as {
    error?: string;
    message?: string;
    queueUnavailable?: boolean;
  };
  return {
    ok: res.ok,
    status: res.status,
    message: data.message,
    error: data.error,
    queueUnavailable: data.queueUnavailable,
  };
}
