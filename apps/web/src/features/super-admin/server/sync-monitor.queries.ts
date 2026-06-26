import "server-only";

import {
  getGlobalAutoPollHealth,
  getGlobalSyncApiSuccess24h,
  listGlobalIngestionDaily7d,
  listGlobalIngestionHourly24h,
  listGlobalIngestionKpis,
  listGlobalSyncFailuresHourly24h,
  listTenantSyncHealth,
  type SyncApiSuccess24h,
} from "@fleethub/auth";
import { getFleetQueuesSnapshot, type FleetQueuesSnapshot } from "@fleethub/db/bullmq-queue-stats";

export type { FleetQueuesSnapshot, SyncApiSuccess24h };

/** @deprecated Use FleetQueuesSnapshot — kept for gradual UI migration. */
export type FleetSyncQueueStats = {
  available: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export function fleetSyncQueueLegacyView(queues: FleetQueuesSnapshot): FleetSyncQueueStats {
  return {
    available: queues.available,
    waiting: queues.fleetSync.waiting,
    active: queues.fleetSync.active,
    delayed: queues.fleetSync.delayed,
    failed: queues.fleetSync.failed,
  };
}

export async function getSuperAdminSyncMonitorData() {
  const [
    tenants,
    queues,
    syncApi24h,
    autoPoll,
    ingestion,
    ingestionHourly24h,
    ingestionDaily7d,
    syncFailures24h,
  ] = await Promise.all([
    listTenantSyncHealth(),
    getFleetQueuesSnapshot(),
    getGlobalSyncApiSuccess24h(),
    getGlobalAutoPollHealth(),
    listGlobalIngestionKpis(24),
    listGlobalIngestionHourly24h(),
    listGlobalIngestionDaily7d(),
    listGlobalSyncFailuresHourly24h(),
  ]);
  return {
    tenants,
    queues,
    queue: fleetSyncQueueLegacyView(queues),
    syncApi24h,
    autoPoll,
    ingestion,
    ingestionHourly24h,
    ingestionDaily7d,
    syncFailures24h,
  };
}
