import { tenantCalendarDayKey, tenantDayEndFromIso, tenantDayStartFromIso } from "@fleethub/auth/display-timezone";
import { access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  companyWhere,
  tenantDriverWhere,
  resolveCompanyScopeForSession,
} from "@fleethub/auth/tenant-scope";
import {
  buildTenantTripsExportCsv,
  countTenantTripsForExport,
  TRIP_EXPORT_SYNC_MAX,
} from "@fleethub/auth/tenant-trip-export";
import { withTenant } from "@fleethub/db";
import { rowsToCsv } from "../lib/csv.js";
import {
  enqueueTenantTripsExport,
  getTenantExportJob,
  type TenantExportJobResult,
  tenantExportFilePath,
} from "../lib/tenant-export-queue.js";
import { buildExportFilename } from "../lib/export-filename.js";
import { buildAnalyticsXlsx } from "../lib/analytics-export.js";
import { buildAuditLogXlsx } from "../lib/audit-log-export.js";
import { buildSyncHistoryXlsx } from "../lib/sync-history-export.js";
import { buildDriversXlsx } from "../lib/drivers-export.js";
import { buildCompaniesXlsx } from "../lib/companies-export.js";
import { buildAppsUsageXlsx } from "../lib/apps-export.js";
import { buildClosedShiftsPdfZip } from "../lib/closed-shifts-pdf-zip.js";
import {
  buildCerrarTurnosXlsx,
  buildTurnosCerradosXlsx,
  parseShiftExportPlatform,
} from "../lib/shift-exports.js";
import { getTenantProductivityThresholds } from "@fleethub/auth";
import { httpStatusForRbacError, requireExportSession, requireTenantSession } from "../lib/rbac.js";
import { readSession } from "../lib/session.js";

function sendCsv(reply: FastifyReply, filename: string, body: string) {
  reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(body);
}

function profileField(profile: unknown, key: string): string {
  if (!profile || typeof profile !== "object") return "";
  const v = (profile as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function handleRbacError(reply: FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  const status = httpStatusForRbacError(code);
  return reply.status(status).send({
    error: status === 403 ? "No autorizado para esta acción." : "No autorizado.",
  });
}

function handleClosedShiftsZipError(reply: FastifyReply, err: unknown) {
  const message = err instanceof Error ? err.message : "Error al generar ZIP.";
  if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
    return handleRbacError(reply, err);
  }
  if (message.includes("No hay turnos") || message.includes("No se pudo generar")) {
    return reply.status(404).send({ error: message });
  }
  if (message.includes("autorizado") || message.includes("administrador")) {
    return reply.status(403).send({ error: message });
  }
  return reply.status(500).send({ error: message });
}

export async function registerTenantExportRoutes(app: FastifyInstance) {
  app.get("/api/tenant/export/empresas.csv", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const scope = await resolveCompanyScopeForSession(session);

      const companies = await withTenant(session.tid, (tx) =>
        tx.company.findMany({
          where: { tenantId: session.tid, ...companyWhere(scope) },
          orderBy: { legalName: "asc" },
          include: { _count: { select: { drivers: true } } },
        }),
      );

      const csv = rowsToCsv(
        [
          "razon_social",
          "nif",
          "estado",
          "conductores",
          "contacto",
          "email",
          "telefono",
          "ciudad",
        ],
        companies.map((c) => [
          c.legalName,
          c.taxId ?? "",
          c.isActive ? "activo" : "inactivo",
          String(c._count.drivers),
          profileField(c.profile, "contactName"),
          profileField(c.profile, "email"),
          profileField(c.profile, "phone"),
          profileField(c.profile, "city"),
        ]),
      );

      sendCsv(reply, "empresas.csv", csv);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/empresas.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const buffer = await buildCompaniesXlsx(session);
      const filename = buildExportFilename("Empresas", "xlsx");
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/conductores.csv", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const scope = await resolveCompanyScopeForSession(session);
      const tenantId = session.tid;

      const drivers = await withTenant(tenantId, (tx) =>
        tx.driver.findMany({
          where: {
            ...tenantDriverWhere(tenantId, scope),
            company: { tenantId, isActive: true },
          },
          orderBy: { fullName: "asc" },
          include: { company: { select: { legalName: true } } },
        }),
      );

      const csv = rowsToCsv(
        ["nombre", "empresa", "estado", "licencia", "telefono", "email"],
        drivers.map((d) => [
          d.fullName,
          d.company.legalName,
          d.isActive ? "activo" : "inactivo",
          d.licenseNumber ?? "",
          d.phone ?? "",
          d.email ?? "",
        ]),
      );

      sendCsv(reply, "conductores.csv", csv);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/conductores.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const buffer = await buildDriversXlsx(session);
      const filename = buildExportFilename("Conductores", "xlsx");
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/viajes.csv", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const scope = await resolveCompanyScopeForSession(session);

      const count = await withTenant(session.tid, (tx) =>
        countTenantTripsForExport(tx, session.tid, scope),
      );
      if (count > TRIP_EXPORT_SYNC_MAX) {
        return reply.status(409).send({
          error: `Hay ${count.toLocaleString("es-ES")} viajes. Usa exportación en segundo plano.`,
          asyncRequired: true,
          count,
          startUrl: "/api/tenant/export/viajes/async",
        });
      }

      const csv = await withTenant(session.tid, (tx) =>
        buildTenantTripsExportCsv(tx, session.tid, scope),
      );
      sendCsv(reply, "viajes.csv", csv);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.post("/api/tenant/export/viajes/async", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const scope = await resolveCompanyScopeForSession(session);
      const jobId = await enqueueTenantTripsExport(session.tid, scope);
      return reply.status(202).send({
        jobId,
        statusUrl: `/api/tenant/export/jobs/${jobId}`,
        downloadUrl: `/api/tenant/export/jobs/${jobId}/download`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("REDIS_URL")) {
        return reply.status(503).send({ error: "Exportación en segundo plano no disponible." });
      }
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/jobs/:jobId", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const { jobId } = request.params as { jobId: string };
      const job = await getTenantExportJob(jobId);
      if (!job || job.data.tenantId !== session.tid) {
        return reply.status(404).send({ error: "Trabajo no encontrado." });
      }

      const state = await job.getState();
      const result = job.returnvalue as TenantExportJobResult | undefined;
      return reply.send({
        jobId,
        state,
        rowCount: result?.rowCount ?? null,
        downloadUrl:
          state === "completed"
            ? `/api/tenant/export/jobs/${jobId}/download`
            : null,
        failedReason: state === "failed" ? job.failedReason : null,
      });
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/jobs/:jobId/download", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const { jobId } = request.params as { jobId: string };
      const job = await getTenantExportJob(jobId);
      if (!job || job.data.tenantId !== session.tid) {
        return reply.status(404).send({ error: "Trabajo no encontrado." });
      }

      const state = await job.getState();
      if (state !== "completed") {
        return reply.status(409).send({ error: "La exportación aún no ha terminado.", state });
      }

      const result = job.returnvalue as TenantExportJobResult | undefined;
      const filePath = result?.filePath ?? tenantExportFilePath(jobId);
      try {
        await access(filePath);
      } catch {
        return reply.status(410).send({ error: "El archivo de exportación ya no está disponible." });
      }

      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${result?.filename ?? "viajes.csv"}"`);
      return reply.send(createReadStream(filePath));
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/apps.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const thresholds = await getTenantProductivityThresholds(session.tid);
      const q = request.query as { platform?: string };
      const platformSlug = q.platform?.trim();
      const buffer = await buildAppsUsageXlsx(session, thresholds, platformSlug);
      const filename = buildExportFilename(
        platformSlug ? `Apps_${platformSlug.toUpperCase()}` : "Apps",
        "xlsx",
        "hoy",
      );
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/historial-sync.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const buffer = await buildSyncHistoryXlsx(session);
      const filename = buildExportFilename("HistorialSync", "xlsx");
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/registro-actividad.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const buffer = await buildAuditLogXlsx(session);
      const filename = buildExportFilename("RegistroActividad", "xlsx");
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("administrador") || msg.includes("autorizado")) {
        return reply.status(403).send({ error: msg || "No autorizado." });
      }
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/analitica.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const q = request.query as { from?: string; to?: string; platform?: string };
      const fromIso = q.from?.slice(0, 10);
      const toIso = q.to?.slice(0, 10);
      const from =
        fromIso && /^\d{4}-\d{2}-\d{2}$/.test(fromIso)
          ? tenantDayStartFromIso(fromIso)
          : tenantDayStartFromIso(tenantCalendarDayKey(new Date()));
      const to =
        toIso && /^\d{4}-\d{2}-\d{2}$/.test(toIso)
          ? tenantDayEndFromIso(toIso)
          : tenantDayEndFromIso(tenantCalendarDayKey(new Date()));
      const buffer = await buildAnalyticsXlsx(session, from, to, q.platform);
      const range = `${q.from ?? "inicio"}_${q.to ?? "fin"}`;
      const filename = buildExportFilename("Analitica", "xlsx", range);
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/cerrar-turnos.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const q = request.query as { platform?: string };
      const platform = parseShiftExportPlatform(q.platform);
      const buffer = await buildCerrarTurnosXlsx(
        session,
        platform,
        request.headers.cookie,
      );
      const reportType = platform ? `CerrarTurnos_${platform}` : "CerrarTurnos";
      const filename = buildExportFilename(reportType, "xlsx");
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  app.get("/api/tenant/export/turnos-cerrados.xlsx", async (request, reply) => {
    try {
      const session = requireTenantSession(await readSession(request));
      const q = request.query as { from?: string; to?: string; platform?: string; q?: string };
      const platform = parseShiftExportPlatform(q.platform);
      const buffer = await buildTurnosCerradosXlsx(
        session,
        q.from,
        q.to,
        platform,
        request.headers.cookie,
        q.q,
      );
      const range =
        q.from && q.to ? `${q.from}_${q.to}` : q.from ?? q.to ?? "historico";
      const reportType = platform ? `TurnosCerrados_${platform}` : "TurnosCerrados";
      const filename = buildExportFilename(reportType, "xlsx", range);
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buffer);
    } catch (err) {
      return handleRbacError(reply, err);
    }
  });

  async function sendClosedShiftsPdfZip(request: FastifyRequest, reply: FastifyReply) {
    const session = requireExportSession(await readSession(request));
    const q = request.query as { from?: string; to?: string };
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;
    if (q.from) {
      const iso = q.from.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return reply.status(400).send({ error: "Fecha desde no válida." });
      }
      dateFrom = tenantDayStartFromIso(iso);
    }
    if (q.to) {
      const iso = q.to.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return reply.status(400).send({ error: "Fecha hasta no válida." });
      }
      dateTo = tenantDayEndFromIso(iso);
    }
    const { buffer, rangeLabel } = await buildClosedShiftsPdfZip(session, dateFrom, dateTo);
    const filename = buildExportFilename("TurnosCerradosPDFs", "zip", rangeLabel);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer);
  }

  app.get("/api/tenant/export/turnos-cerrados-pdfs", async (request, reply) => {
    try {
      return await sendClosedShiftsPdfZip(request, reply);
    } catch (err) {
      return handleClosedShiftsZipError(reply, err);
    }
  });

  /** Legacy path — prefer `/turnos-cerrados-pdfs` (some proxies block `.zip` in the URL). */
  app.get("/api/tenant/export/turnos-cerrados-pdfs.zip", async (request, reply) => {
    try {
      return await sendClosedShiftsPdfZip(request, reply);
    } catch (err) {
      return handleClosedShiftsZipError(reply, err);
    }
  });
}
