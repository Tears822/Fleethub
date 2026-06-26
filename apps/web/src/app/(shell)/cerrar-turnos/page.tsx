import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { listPendingShiftRows } from "@/features/shifts/server/pending-shifts.queries";
import { canExportTenantData } from "@/domain/rbac.policy";
import { CerrarTurnosMockView } from "@/features/shifts/ui/cerrar-turnos-mock-view";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export const dynamic = "force-dynamic";

export default async function CerrarTurnosPage() {
  const session = await requireTenantSession();
  assertTenantRouteAllowed(session, "/cerrar-turnos");

  const { t } = await getSessionTranslator(session);
  const [scope, companyScopeLabel] = await Promise.all([
    resolveCompanyScope(session),
    resolveCompanyScopeLabel(session),
  ]);
  const pendingRows = await listPendingShiftRows(session.tid, scope);

  return (
    <ShellPage
      fillViewport
      title={t("turnos.cerrar")}
      description={`${companyScopeLabel} · ${t("turnos.pendingSettlement")}`}
    >
      <CerrarTurnosMockView
        initialDbRows={pendingRows}
        canExportExcel={canExportTenantData(session.role)}
      />
    </ShellPage>
  );
}
