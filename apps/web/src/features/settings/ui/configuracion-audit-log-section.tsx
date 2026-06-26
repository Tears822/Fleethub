"use client";

import { ScrollText } from "lucide-react";
import type { TenantAuditLogRow } from "@/features/settings/server/audit-logs.queries";
import { AUDIT_LOG_RETENTION_DAYS } from "@/features/settings/lib/audit-log-constants";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";

/** Filas visibles sin scroll; el resto del listado se desplaza en el contenedor. */
const VISIBLE_ROW_COUNT = 10;
/** ~3.25rem por fila de datos + cabecera fija */
const SCROLL_MAX_HEIGHT = "calc(3.25rem * 10 + 2.5rem)";

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "ca" ? "ca-ES" : "es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ConfiguracionAuditLogSection({
  rows,
  canExport = false,
}: {
  rows: TenantAuditLogRow[];
  canExport?: boolean;
}) {
  const { t, locale } = useTranslations();
  const exportHref = "/api/tenant/export/registro-actividad.xlsx";

  const summaryText =
    rows.length <= VISIBLE_ROW_COUNT
      ? rows.length === 1
        ? t("config.auditLog.runCountOne", { count: rows.length, days: AUDIT_LOG_RETENTION_DAYS })
        : t("config.auditLog.runCountMany", { count: rows.length, days: AUDIT_LOG_RETENTION_DAYS })
      : t("config.auditLog.showingRecent", {
          count: rows.length,
          days: AUDIT_LOG_RETENTION_DAYS,
          visible: VISIBLE_ROW_COUNT,
        });

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
            <ScrollText className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <h2 className="text-sm font-semibold text-zinc-900">{t("config.auditLog.title")}</h2>
        </div>
        {canExport && rows.length > 0 ? (
          <ExportFileButton
            href={exportHref}
            label={t("config.auditLog.downloadExcel")}
            filename="registro-actividad.xlsx"
          />
        ) : null}
      </div>

      <p className="mb-4 text-xs text-zinc-600">
        {t("config.auditLog.description", { days: AUDIT_LOG_RETENTION_DAYS })}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("config.auditLog.empty")}</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-zinc-500">{summaryText}</p>
          <VuiTableShell className="overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: SCROLL_MAX_HEIGHT }}>
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(228_228_231)]">
                  <tr className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2">{t("config.auditLog.date")}</th>
                    <th className="px-3 py-2">{t("config.auditLog.action")}</th>
                    <th className="px-3 py-2">{t("config.auditLog.user")}</th>
                    <th className="px-3 py-2">{t("config.auditLog.detail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700">
                        {formatWhen(row.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-zinc-900">{row.actionLabel}</td>
                      <td className="px-3 py-2.5 text-zinc-700">
                        <span className="font-medium text-zinc-800">{row.actorName}</span>
                        {row.actorEmail ? (
                          <span className="mt-0.5 block text-[10px] text-zinc-500">
                            {row.actorEmail}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-xs px-3 py-2.5 text-zinc-600">
                        {row.detail ?? (
                          <span className="text-zinc-400">
                            {row.entityType ? `${row.entityType}` : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </VuiTableShell>
        </>
      )}
    </VuiPanel>
  );
}
