import { canExportTenantData } from "@/domain/rbac.policy";
import { resolveBillingDateRange } from "@/features/billing/lib/billing-date-range";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { billingCompanyScopeLabel } from "@/features/billing/server/billing-company-scope-label";
import { listBillingReport } from "@/features/billing/server/billing.queries";
import { FacturacionMockView } from "@/features/billing/ui/facturacion-mock-view";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const scope = await resolveCompanyScope(session);
  const sp = await searchParams;
  const range = resolveBillingDateRange(sp);

  const [report, companyScopeLabel] = await Promise.all([
    listBillingReport(session.tid, scope, range.dateFrom, range.dateTo),
    billingCompanyScopeLabel(session, scope),
  ]);
  const usingLiveData = report.byDriver.length > 0;

  return (
    <ShellPage
      title={t("nav.facturacion")}
      description={t("billing.pageDescription", {
        scope: companyScopeLabel,
        from: range.dateFromEs,
        to: range.dateToEs,
      })}
    >
      <FacturacionMockView
        initialReport={report}
        usingLiveData={usingLiveData}
        dateFrom={range.dateFromEs}
        dateTo={range.dateToEs}
        companyScopeLabel={companyScopeLabel}
        canExportExcel={canExportTenantData(session.role)}
      />
    </ShellPage>
  );
}
