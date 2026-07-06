import Link from "next/link";
import { canManageDrivers } from "@/domain/rbac.policy";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { ConductorDetalleView } from "@/features/drivers/ui/conductor-detalle-view";
import { getDriverDetailStats } from "@/features/drivers/server/driver-detail.queries";
import { listDriverPlatformConnections } from "@/features/drivers/server/driver-platform-connections.queries";
import { refreshDriverConnectionsForTenantSession } from "@/features/integrations/server/refresh-driver-connections.server";
import { listDriverVehicleAssignments } from "@/features/drivers/server/driver-vehicle-assignments.queries";
import { getDriverById } from "@/features/drivers/server/drivers.queries";
import { readCompanyEconomicDefaults } from "@fleethub/auth/company-economic-defaults";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function ConductoresDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  await refreshDriverConnectionsForTenantSession();
  const scope = await resolveCompanyScope(session);
  const driver = await getDriverById(session.tid, id, scope);

  if (!driver) {
    return (
      <ShellPage
        title={t("nav.conductores")}
        description={t("conductoresPage.profileDescription")}
        actions={
          <Link href="/conductores" className="erp-btn-outline text-xs">
            {t("common.backToList")}
          </Link>
        }
      >
        <p className="text-sm text-zinc-600">{t("conductoresPage.notFound")}</p>
      </ShellPage>
    );
  }

  const platforms = driver.driverPlatformAccounts.map((a) => a.platform);
  const vehicleAssignments = await listDriverVehicleAssignments(session.tid, id, scope);

  const [platformConnections, stats] = await Promise.all([
    listDriverPlatformConnections(session.tid, id, scope),
    getDriverDetailStats(session.tid, id, scope),
  ]);

  const resolvedStats =
    stats ?? {
      todayFacturacion: "0,00 €",
      todayViajes: 0,
      todayHoras: "0h 0min",
      todayEurH: "0,00",
      closedShifts: [],
      last7Days: [],
      monthlyHistory: [],
      performance: null,
      hasLiveData: false,
    };

  return (
    <ShellPage
      title={t("nav.conductores")}
      description={t("conductoresPage.profileTitle", { name: driver.fullName })}
      actions={
        <>
          <Link href="/conductores" className="erp-btn-outline text-xs">
            {t("common.backToList")}
          </Link>
          {canManageDrivers(session.role) ? (
            <Link href={`/conductores/${id}/editar`} className="erp-btn-success text-xs">
              {t("conductoresPage.editDriver")}
            </Link>
          ) : null}
        </>
      }
    >
      <ConductorDetalleView
        platformConnections={platformConnections}
        stats={resolvedStats}
        vehicleAssignments={vehicleAssignments}
        canEditEconomics={canManageDrivers(session.role)}
        companyDefaults={readCompanyEconomicDefaults(driver.company.profile)}
        driver={{
          id: driver.id,
          fullName: driver.fullName,
          isActive: driver.isActive,
          companyLegalName: driver.company.legalName,
          platforms: platforms.length > 0 ? platforms : ["UBER", "FREENOW"],
          dni: driver.dni,
          phone: driver.phone,
          email: driver.email,
          birthDate: driver.birthDate,
          licenseNumber: driver.licenseNumber,
          vehiclePlate: driver.vehiclePlate,
          vehicleModel: driver.vehicleModel,
          driverSharePct: driver.driverSharePct,
          driverBonusSharePct: driver.driverBonusSharePct,
          driverPlatformFeeSharePct: driver.driverPlatformFeeSharePct,
          dailyFixedCents: driver.dailyFixedCents,
          createdAt: driver.createdAt,
        }}
      />
    </ShellPage>
  );
}
