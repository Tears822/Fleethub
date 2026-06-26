import type { FastifyInstance, FastifyRequest } from "fastify";
import { writeAuditLog } from "@fleethub/db";
import { enqueueWebhookIngestJob } from "../lib/webhook-queue.js";
import { resolveWebhookTenant, summarizeWebhookPayload } from "../lib/webhook-tenant.js";
import {
  verifyPlatformWebhook,
  type WebhookPlatform,
} from "../lib/webhook-verify.js";

type WebhookRequest = FastifyRequest<{ Body: unknown }> & { rawBody?: Buffer };

type WebhookReply = {
  status: (code: number) => {
    send: (body?: unknown) => unknown;
    type?: (contentType: string) => { send: (body?: unknown) => unknown };
  };
};

/** Uber rental platform spec: 200 + empty body acknowledges receipt (stops retries). */
function acknowledgeUber(reply: WebhookReply) {
  return reply.status(200).send("");
}

function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}

function uberEnvironment(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const v = headers["x-environment"];
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return v[0]?.trim() || null;
  return null;
}

async function persistAndEnqueueWebhook(args: {
  platform: WebhookPlatform;
  tenantId: string | null;
  tenantSlug: string | null;
  body: unknown;
  rawBody: Buffer;
  signatureVerified: boolean;
  uberEnvironment: string | null;
  ip: string | null;
  tenantError?: string;
}) {
  const summary = summarizeWebhookPayload(args.platform, args.body);
  const receivedAt = new Date().toISOString();
  const bodyJson = args.rawBody.toString("utf8").slice(0, 256_000);

  await writeAuditLog({
    tenantId: args.tenantId,
    action: args.tenantError ? "webhook.received.unresolved_tenant" : "webhook.received",
    entityType: args.platform,
    ip: args.ip,
    payload: {
      ...summary,
      tenantSlug: args.tenantSlug,
      receivedAt,
      signatureVerified: args.signatureVerified,
      uberEnvironment: args.uberEnvironment,
      tenantError: args.tenantError,
    },
  });

  if (!args.tenantId || !args.tenantSlug) return;

  await enqueueWebhookIngestJob({
    tenantId: args.tenantId,
    tenantSlug: args.tenantSlug,
    platform: args.platform,
    eventType: summary.eventType,
    receivedAt,
    bodyJson,
  });
}

/**
 * Uber Vehicle Suppliers webhooks (confidential API):
 * - Verify X-Uber-Signature (HMAC-SHA256 hex, client secret)
 * - Respond 200 with empty body on success
 */
async function handleUberWebhook(request: WebhookRequest, reply: WebhookReply) {
  const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
  const uberEnv = uberEnvironment(request.headers);

  const verified = verifyPlatformWebhook("uber", rawBody, request.headers);
  if (!verified.ok) {
    return reply.status(verified.status).send({ error: verified.message });
  }

  const tenant = await resolveWebhookTenant("uber", request.headers, request.body);

  await persistAndEnqueueWebhook({
    platform: "uber",
    tenantId: "error" in tenant ? null : tenant.tenantId,
    tenantSlug: "error" in tenant ? null : tenant.tenantSlug,
    body: request.body,
    rawBody,
    signatureVerified: !verified.skipped,
    uberEnvironment: uberEnv,
    ip: clientIp(request),
    tenantError: "error" in tenant ? tenant.error : undefined,
  });

  return acknowledgeUber(reply);
}

async function handleFreenowWebhook(request: WebhookRequest, reply: WebhookReply) {
  const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));

  const verified = verifyPlatformWebhook("freenow", rawBody, request.headers);
  if (!verified.ok) {
    return reply.status(verified.status).send({ error: verified.message });
  }

  const tenant = await resolveWebhookTenant("freenow", request.headers, request.body);
  if ("error" in tenant) {
    return reply.status(tenant.status).send({ error: tenant.error });
  }

  await persistAndEnqueueWebhook({
    platform: "freenow",
    tenantId: tenant.tenantId,
    tenantSlug: tenant.tenantSlug,
    body: request.body,
    rawBody,
    signatureVerified: !verified.skipped,
    uberEnvironment: null,
    ip: clientIp(request),
  });

  return reply.status(202).send({
    ok: true,
    accepted: true,
    platform: "freenow",
    tenantId: tenant.tenantId,
    eventType: summarizeWebhookPayload("freenow", request.body).eventType,
  });
}

export function webhookHealthPayload() {
  return {
    ok: true,
    service: "fleethub-api",
    endpoints: ["/api/webhooks/uber", "/api/webhooks/freenow"],
    enqueueEnabled: process.env.WEBHOOK_ENQUEUE_ENABLED === "1",
  };
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.get("/api/webhooks/health", async () => webhookHealthPayload());

  app.post("/api/webhooks/uber", async (request, reply) =>
    handleUberWebhook(request as WebhookRequest, reply),
  );

  app.post("/api/webhooks/freenow", async (request, reply) =>
    handleFreenowWebhook(request as WebhookRequest, reply),
  );
}
