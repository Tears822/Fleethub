import type { FastifyInstance, FastifyReply } from "fastify";
import {
  closeTenantTrips,
  createTenantDriver,
  listShiftTripsForDetail,
  revertTenantShiftClose,
  validateTenantTripPayments,
  updateTenantTripPayments,
  loadShiftLiquidationDocument,
  previewShiftLiquidation,
  updateTenantDriver,
} from "@fleethub/auth";
import { buildExportFilename } from "../lib/export-filename.js";
import { resolveCompanyScopeWithCookieForRequest } from "../lib/export-company-scope-label.js";
import { buildLiquidationPdfBuffer } from "../lib/liquidation-pdf.js";
import { getExportTranslator } from "../lib/export-translator.js";
import {
  httpStatusForRbacError,
  requireExportSession,
  requireOperativaWrite,
  requireTenantSession,
} from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function handleRbacError(reply: FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  return reply.status(httpStatusForRbacError(code)).send({
    error: code === "FORBIDDEN" ? "No autorizado para esta acción." : "No autorizado.",
  });
}

type LiquidationPdfInput = {
  driverId?: string;
  tripIds?: string[];
  allowClosed?: boolean;
  note?: string;
};

async function sendLiquidationPdf(
  reply: FastifyReply,
  session: Awaited<ReturnType<typeof requireExportSession>>,
  input: LiquidationPdfInput,
  cookieHeader?: string,
) {
  const companyScope = await resolveCompanyScopeWithCookieForRequest(session, cookieHeader);
  const result = await loadShiftLiquidationDocument(session, {
    driverId: input.driverId,
    tripIds: input.tripIds,
    allowClosed: input.allowClosed === true,
    note: input.note,
  }, { companyScope });
  if (!result.ok) return reply.status(400).send({ error: result.error.message });

  const t = await getExportTranslator(session);
  const pdf = await buildLiquidationPdfBuffer(result.value, t);
  const range =
    result.value.liquidation.periodFrom && result.value.liquidation.periodTo
      ? `${result.value.liquidation.periodFrom.slice(0, 10)}_${result.value.liquidation.periodTo.slice(0, 10)}`
      : result.value.driverId.slice(0, 8);
  const filename = buildExportFilename("LiquidacionTurno", "pdf", range);

  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(pdf);
}

export async function registerTenantOperativaRoutes(app: FastifyInstance) {
  async function handleShiftTripsDetail(
    request: { headers: { cookie?: string }; log: { error: (obj: unknown, msg: string) => void } },
    reply: import("fastify").FastifyReply,
    input: {
      driverId?: string;
      tripIds?: string[];
      status?: string;
      platform?: string;
      includeActivity?: boolean;
    },
    session: Awaited<ReturnType<typeof readSession>>,
  ) {
    const tenantSession = requireTenantSession(session);
    const companyScope = await resolveCompanyScopeWithCookieForRequest(
      tenantSession,
      request.headers.cookie,
    );
    const result = await listShiftTripsForDetail(
      tenantSession,
      {
        driverId: input.driverId,
        tripIds: input.tripIds,
        liquidationStatus: input.status,
        platform: input.platform,
        includeActivity: input.includeActivity !== false,
      },
      { companyScope },
    );
    if (!result.ok) return reply.status(400).send({ error: result.error.message });
    return reply.send(result.value);
  }

  app.get("/api/tenant/shifts/trips", async (request, reply) => {
    try {
      const session = await readSession(request);
      const q = request.query as {
        driverId?: string;
        tripIds?: string;
        status?: string;
        platform?: string;
        includeActivity?: string;
      };
      const tripIds = q.tripIds
        ? q.tripIds.split(",").map((id) => id.trim()).filter(Boolean)
        : undefined;
      return await handleShiftTripsDetail(
        request,
        reply,
        {
          driverId: q.driverId,
          tripIds,
          status: q.status,
          platform: q.platform,
          includeActivity: q.includeActivity !== "0" && q.includeActivity !== "false",
        },
        session,
      );
    } catch (err) {
      request.log.error({ err }, "shift trips detail failed");
      const code = err instanceof Error ? err.message : "UNKNOWN";
      if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
        return handleRbacError(reply, err);
      }
      return reply.status(500).send({
        error: "No se pudieron cargar los viajes del turno.",
      });
    }
  });

  app.post("/api/tenant/shifts/trips", async (request, reply) => {
    try {
      const session = await readSession(request);
      const body =
        typeof request.body === "object" && request.body !== null
          ? (request.body as Record<string, unknown>)
          : {};
      const tripIds = Array.isArray(body.tripIds)
        ? body.tripIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : undefined;
      return await handleShiftTripsDetail(
        request,
        reply,
        {
          driverId: typeof body.driverId === "string" ? body.driverId : undefined,
          tripIds,
          status: typeof body.status === "string" ? body.status : undefined,
          platform: typeof body.platform === "string" ? body.platform : undefined,
          includeActivity: body.includeActivity !== false && body.includeActivity !== "false",
        },
        session,
      );
    } catch (err) {
      request.log.error({ err }, "shift trips detail POST failed");
      const code = err instanceof Error ? err.message : "UNKNOWN";
      if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
        return handleRbacError(reply, err);
      }
      return reply.status(500).send({
        error: "No se pudieron cargar los viajes del turno.",
      });
    }
  });

  app.post("/api/tenant/drivers", async (request, reply) => {
    try {
      const session = requireOperativaWrite(await readSession(request));
      const result = await createTenantDriver(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.status(201).send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.patch("/api/tenant/drivers/:driverId", async (request, reply) => {
    try {
      const session = requireOperativaWrite(await readSession(request));
      const { driverId } = request.params as { driverId: string };
      const result = await updateTenantDriver(session, driverId, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/shifts/liquidation-pdf", async (request, reply) => {
    try {
      const session = requireExportSession(await readSession(request));
      const q = request.query as {
        driverId?: string;
        tripIds?: string;
        allowClosed?: string;
        note?: string;
      };
      const tripIds = q.tripIds
        ? q.tripIds.split(",").map((id) => id.trim()).filter(Boolean)
        : undefined;
      return await sendLiquidationPdf(reply, session, {
        driverId: q.driverId,
        tripIds,
        allowClosed: q.allowClosed === "1" || q.allowClosed === "true",
        note: q.note,
      }, request.headers.cookie);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/liquidation-pdf", async (request, reply) => {
    try {
      const session = requireExportSession(await readSession(request));
      const body =
        typeof request.body === "object" && request.body !== null
          ? (request.body as Record<string, unknown>)
          : {};
      return await sendLiquidationPdf(reply, session, {
        driverId: typeof body.driverId === "string" ? body.driverId : undefined,
        tripIds: Array.isArray(body.tripIds) ? body.tripIds : undefined,
        allowClosed: body.allowClosed === true,
        note: typeof body.note === "string" ? body.note : undefined,
      }, request.headers.cookie);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/liquidation-preview", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const companyScope = await resolveCompanyScopeWithCookieForRequest(
        session,
        request.headers.cookie,
      );
      const result = await previewShiftLiquidation(session, request.body, { companyScope });
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/validate-payments", async (request, reply) => {
    try {
      const session = requireOperativaWrite(await readSession(request));
      const companyScope = await resolveCompanyScopeWithCookieForRequest(
        session,
        request.headers.cookie,
      );
      const result = await validateTenantTripPayments(session, request.body, { companyScope });
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/trip-payments", async (request, reply) => {
    try {
      const session = requireOperativaWrite(await readSession(request));
      const companyScope = await resolveCompanyScopeWithCookieForRequest(
        session,
        request.headers.cookie,
      );
      const result = await updateTenantTripPayments(session, request.body, { companyScope });
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/close", async (request, reply) => {
    try {
      const session = requireOperativaWrite(await readSession(request));
      const companyScope = await resolveCompanyScopeWithCookieForRequest(
        session,
        request.headers.cookie,
      );
      const result = await closeTenantTrips(session, request.body, { companyScope });
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/shifts/revert-close", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const result = await revertTenantShiftClose(session, request.body);
      if (!result.ok) return reply.status(400).send({ error: result.error.message });
      return reply.send(result.value);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });
}
