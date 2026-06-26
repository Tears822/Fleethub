import type { Job } from "bullmq";
import {
  findDriverPlatformAccount,
  recordIngestionEvent,
  refreshTodayDriverPlatformMetrics,
  upsertNormalizedTripsForDriver,
} from "@fleethub/auth";
import { prisma, RidePlatform, writeAuditLog } from "@fleethub/db";
import { parseFreenowWebhookPayload } from "../lib/freenow-webhook-parse.js";
import { enqueueNarrowPlatformSyncJob } from "../lib/enqueue-narrow-platform-sync.js";
import { enrichUberWebhookTrips, tripNeedsEnrichment } from "../lib/uber-webhook-enrich.js";
import { parseUberWebhookPayload } from "../lib/uber-webhook-parse.js";

export type WebhookIngestJobData = {
  tenantId: string;
  tenantSlug: string;
  platform: "uber" | "freenow";
  eventType: string | null;
  receivedAt: string;
  bodyJson: string;
};

async function wasEventProcessed(tenantId: string, eventId: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      action: "webhook.processed",
      payload: { path: ["eventId"], equals: eventId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function processWebhookIngestJob(job: Job<WebhookIngestJobData>): Promise<void> {
  const data = job.data;
  if (!data?.tenantId) {
    throw new Error("webhook-ingest job missing tenantId");
  }

  let body: unknown;
  try {
    body = JSON.parse(data.bodyJson) as unknown;
  } catch {
    throw new Error("webhook-ingest: invalid JSON body");
  }

  const parsed =
    data.platform === "uber"
      ? parseUberWebhookPayload(body)
      : parseFreenowWebhookPayload(body);

  const platform = data.platform === "uber" ? RidePlatform.UBER : RidePlatform.FREENOW;
  const receivedAt = new Date(data.receivedAt);

  if (parsed.eventId && (await wasEventProcessed(data.tenantId, parsed.eventId))) {
    console.log(
      `[worker] webhook-ingest duplicate event ${parsed.eventId} tenant=${data.tenantSlug}`,
    );
    await recordIngestionEvent({
      tenantId: data.tenantId,
      platform,
      entityType: "webhook_event",
      externalEntityId: parsed.eventId,
      ingestSource: "webhook",
      outcome: "ignored",
      receivedAt,
      webhookEventId: parsed.eventId,
      metadata: { reason: "duplicate_event_id" },
    });
    return;
  }

  if (parsed.ignored) {
    console.log(
      `[worker] webhook-ingest ignored ${data.platform} tenant=${data.tenantSlug}: ${parsed.ignoreReason ?? "n/a"}`,
    );
    if (parsed.eventId) {
      await writeAuditLog({
        tenantId: data.tenantId,
        action: "webhook.ignored",
        entityType: data.platform,
        payload: {
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          reason: parsed.ignoreReason,
        },
      });
      await recordIngestionEvent({
        tenantId: data.tenantId,
        platform,
        entityType: "webhook_event",
        externalEntityId: parsed.eventId,
        ingestSource: "webhook",
        outcome: "ignored",
        receivedAt,
        webhookEventId: parsed.eventId,
        metadata: { reason: parsed.ignoreReason ?? "ignored" },
      });
    }
    return;
  }

  const externalDriverId = parsed.externalDriverId;
  if (!externalDriverId) {
    console.warn(
      `[worker] webhook-ingest ${data.platform}: trip data but no driver id (tenant=${data.tenantSlug})`,
    );
    return;
  }

  let trips = parsed.trips;
  let enrichedVia: string | null = null;
  if (data.platform === "uber") {
    const enriched = await enrichUberWebhookTrips({
      tenantId: data.tenantId,
      externalDriverId,
      trips: parsed.trips,
      body,
    });
    trips = enriched.trips;
    enrichedVia = enriched.enrichedVia;
  }

  const dpa = await findDriverPlatformAccount(data.tenantId, platform, externalDriverId);
  if (!dpa) {
    console.warn(
      `[worker] webhook-ingest: driver ${externalDriverId.slice(0, 8)}… not linked for ${data.platform} (tenant=${data.tenantSlug})`,
    );
    await writeAuditLog({
      tenantId: data.tenantId,
      action: "webhook.unlinked_driver",
      entityType: data.platform,
      payload: {
        eventId: parsed.eventId,
        eventType: parsed.eventType,
        externalDriverId,
        tripIds: trips.map((t) => t.externalTripId),
      },
    });
    return;
  }

  const result = await upsertNormalizedTripsForDriver(
    data.tenantId,
    dpa.id,
    dpa.driverId,
    platform,
    trips,
    "webhook",
    {
      webhookEventId: parsed.eventId,
      receivedAt,
    },
  );

  const needsNarrowSync =
    (data.platform === "uber" && trips.some(tripNeedsEnrichment)) ||
    (data.platform === "freenow" && trips.length > 0 && result.upserted === 0);

  let narrowSyncJobId: string | undefined;
  if (needsNarrowSync) {
    narrowSyncJobId = await enqueueNarrowPlatformSyncJob({
      tenantId: data.tenantId,
      platform,
      driverPlatformAccountId: dpa.id,
    });
    if (narrowSyncJobId) {
      console.log(
        `[worker] webhook-ingest: narrow platform-sync queued (${narrowSyncJobId}) driver=${externalDriverId.slice(0, 8)}…`,
      );
    }
  }

  await writeAuditLog({
    tenantId: data.tenantId,
    action: "webhook.processed",
    entityType: data.platform,
    payload: {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      externalDriverId,
      tripsUpserted: result.upserted,
      tripsCreated: result.created,
      tripsUpdated: result.updated,
      ingestCollisions: result.ingestCollisions,
      ingestSource: "webhook",
      enrichedVia,
      narrowSyncJobId: narrowSyncJobId ?? null,
      narrowSyncRequested: needsNarrowSync,
    },
  });

  if (result.upserted > 0) {
    try {
      await refreshTodayDriverPlatformMetrics(data.tenantId, { mode: "all" });
    } catch (e) {
      console.warn(
        "[worker] webhook-ingest: day metrics refresh failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  console.log(
    `[worker] webhook-ingest ${data.platform} tenant=${data.tenantSlug}: ${result.upserted} trip(s) (webhook${enrichedVia ? `, enrich=${enrichedVia}` : ""}), collisions=${result.ingestCollisions}${narrowSyncJobId ? ", narrow-sync" : ""}`,
  );
}
