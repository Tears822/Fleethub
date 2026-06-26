import Link from "next/link";
import { redirect } from "next/navigation";
import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { listCompaniesForTenant } from "@/features/companies/server/companies.queries";
import { birthDateInputValue } from "@/features/drivers/lib/driver-form-payload";
import { getDriverById } from "@/features/drivers/server/drivers.queries";
import { ConductorEditForm } from "@/features/drivers/ui/conductor-edit-form";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function ConductoresEditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  assertTenantRouteAllowed(session, `/conductores/${id}/editar`);

  const scope = await resolveCompanyScope(session);
  const [driver, companies] = await Promise.all([
    getDriverById(session.tid, id, scope),
    listCompaniesForTenant(session.tid, scope),
  ]);

  if (!driver) {
    redirect("/conductores");
  }

  const platforms = driver.driverPlatformAccounts.map((a) => a.platform);
  const uberAccount = driver.driverPlatformAccounts.find((a) => a.platform === "UBER");
  const uberRaw = uberAccount?.externalDriverId ?? "";
  const uberExternalDriverId =
    uberRaw.startsWith("seed-") || uberRaw.startsWith("manual-") ? "" : uberRaw;
  const freenowAccount = driver.driverPlatformAccounts.find((a) => a.platform === "FREENOW");
  const freenowRaw = freenowAccount?.externalDriverId ?? "";
  const freenowExternalDriverId =
    freenowRaw.startsWith("seed-") || freenowRaw.startsWith("manual-") ? "" : freenowRaw;

  return (
    <ShellPage
      title={t("pages.editDriver")}
      description={driver.fullName}
      actions={
        <Link href={`/conductores/${id}`} className="erp-btn-outline text-xs">
          ← Volver a la ficha
        </Link>
      }
    >
      <ConductorEditForm
        driver={{
          id: driver.id,
          fullName: driver.fullName,
          companyId: driver.companyId,
          isActive: driver.isActive,
          dni: driver.dni,
          phone: driver.phone,
          email: driver.email,
          birthDate: birthDateInputValue(driver.birthDate),
          licenseNumber: driver.licenseNumber,
          vehiclePlate: driver.vehiclePlate,
          vehicleModel: driver.vehicleModel,
          platforms: platforms.filter(
            (p): p is "UBER" | "FREENOW" => p === "UBER" || p === "FREENOW",
          ),
          uberExternalDriverId,
          freenowExternalDriverId,
        }}
        companies={companies.map((c) => ({ id: c.id, legalName: c.legalName }))}
      />
    </ShellPage>
  );
}
