import { canExportTenantData, canReopenClosedShift } from "@/domain/rbac.policy";
import { resolveBillingDateRange } from "@/features/billing/lib/billing-date-range";
import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { listClosedShiftRows } from "@/features/shifts/server/closed-shifts.queries";
import { TurnosCerradosMockView } from "@/features/shifts/ui/turnos-cerrados-mock-view";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";
import { ExportViajesCsvButton } from "@/shared/ui/export-viajes-csv-button";
import { ExportFileButton } from "@/shared/ui/export-file-button";

export default async function TurnosCerradosPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shift?: string; driver?: string }>;
}) {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const [scope, companyScopeLabel] = await Promise.all([
    resolveCompanyScope(session),
    resolveCompanyScopeLabel(session),
  ]);
  const sp = await searchParams;
  const range = resolveBillingDateRange(sp, { defaultWhenMissing: "last-7-days" });
  const closedRows = await listClosedShiftRows(session.tid, scope, {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });
  const exportQuery = `?from=${range.fromIso}&to=${range.toIso}`;

  return (
    <ShellPage
      fillViewport
      title={t("nav.turnosCerrados")}
      description={t("turnos.closedPageDescription", {
        scope: companyScopeLabel,
        from: range.dateFromEs,
        to: range.dateToEs,
      })}
      actions={
        canExportTenantData(session.role) ? (
          <div className="flex flex-wrap gap-2">
            <ExportFileButton
              href={`/api/tenant/export/turnos-cerrados-pdfs${exportQuery}`}
              label="ZIP PDFs"
              filename="turnos-cerrados-pdfs.zip"
            />
            <ExportViajesCsvButton />
          </div>
        ) : null
      }
    >
      <TurnosCerradosMockView
        initialDbRows={closedRows}
        dateFrom={range.dateFromEs}
        dateTo={range.dateToEs}
        initialOpenShiftKey={sp.shift?.trim() || undefined}
        initialDriverId={sp.driver?.trim() || undefined}
        canExportCsv={canExportTenantData(session.role)}
        canExportExcel={canExportTenantData(session.role)}
        canRevertClose={Boolean(session.impersonating)}
        canReopenClosedShift={canReopenClosedShift(session.role)}
        tenantId={session.tid}
      />
    </ShellPage>
  );
}
