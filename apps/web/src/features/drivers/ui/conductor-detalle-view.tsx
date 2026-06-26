"use client";

import { useState, type ReactNode } from "react";
import { Truck, User } from "lucide-react";
import {
  driverInitials,
  type ConductorDetalleProfile,
} from "@/features/drivers/lib/conductor-detalle-mock";
import type { DriverDetailStats } from "@/features/drivers/server/driver-detail.queries";
import type { DriverPlatformConnectionRow } from "@/features/drivers/server/driver-platform-connections.queries";
import { ConductorPlataformasConexion } from "@/features/drivers/ui/conductor-plataformas-conexion";
import type { DriverVehicleAssignmentRow } from "@/features/drivers/server/driver-vehicle-assignments.queries";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiStatCard } from "@/shared/ui/vui-stat-card";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { ridePlatformsToLogoIds } from "@/shared/lib/ride-platform-logos";
import { MockPlatformDots } from "@/shared/ui/mock-platform-dots";
import { ConductorEconomicoForm } from "@/features/drivers/ui/conductor-economico-form";
import type { CompanyEconomicDefaults } from "@fleethub/auth/company-economic-defaults";
import { DriverRendimientoTab } from "@/features/drivers/ui/driver-rendimiento-tab";
import { DriverTurnosCerradosTab } from "@/features/drivers/ui/driver-turnos-cerrados-tab";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export type ConductorDetalleDriver = {
  id: string;
  fullName: string;
  isActive: boolean;
  companyLegalName: string;
  platforms: Array<"UBER" | "FREENOW" | "BOLT" | "CABIFY">;
  dni?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: Date | null;
  licenseNumber?: string | null;
  vehiclePlate?: string | null;
  vehicleModel?: string | null;
  driverSharePct?: number | null;
  driverBonusSharePct?: number | null;
  driverPlatformFeeSharePct?: number | null;
  dailyFixedCents?: bigint | null;
  createdAt?: Date;
};

function formatDateEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function profileFromDriver(driver: ConductorDetalleDriver): ConductorDetalleProfile & {
  driverShare: string;
} {
  const vehicle =
    [driver.vehiclePlate, driver.vehicleModel].filter(Boolean).join(" · ") || "—";
  return {
    dni: driver.dni?.trim() || "—",
    phone: driver.phone?.trim() || "—",
    email: driver.email?.trim() || "—",
    birthDate: driver.birthDate ? formatDateEs(driver.birthDate) : "—",
    license: driver.licenseNumber?.trim() || "—",
    vehicle,
    altaDate: driver.createdAt ? formatDateEs(driver.createdAt) : "—",
    connectionStatus: "—",
    driverShare: driver.driverSharePct != null ? `${driver.driverSharePct} %` : "—",
  };
}

type TabId = "datos" | "vehiculos" | "rendimiento" | "turnos" | "economico";

const TAB_IDS: TabId[] = ["datos", "vehiculos", "rendimiento", "turnos", "economico"];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 py-2.5 last:border-0">
      <dt className="shrink-0 text-xs text-zinc-500">{label}</dt>
      <dd className="text-right text-xs font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function DatosTab({
  profile,
  driver,
  platformConnections,
}: {
  profile: ConductorDetalleProfile;
  driver: ConductorDetalleDriver;
  platformConnections: DriverPlatformConnectionRow[];
}) {
  const { t } = useTranslations();
  const platformLogos = ridePlatformsToLogoIds(driver.platforms);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VuiPanel className="p-4 md:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <User className="h-4 w-4 text-violet-600" aria-hidden />
          {t("conductores.form.personalData")}
        </h3>
        <dl className="mt-3">
          <DetailRow label={t("conductores.form.fullName")}>{driver.fullName}</DetailRow>
          <DetailRow label={t("conductores.form.dni")}>{profile.dni}</DetailRow>
          <DetailRow label={t("conductores.form.birthDate")}>{profile.birthDate}</DetailRow>
          <DetailRow label={t("conductores.form.phone")}>{profile.phone}</DetailRow>
          <DetailRow label={t("conductores.form.email")}>
            {profile.email !== "—" ? (
              <a href={`mailto:${profile.email}`} className="text-sky-600 hover:underline">
                {profile.email}
              </a>
            ) : (
              "—"
            )}
          </DetailRow>
        </dl>
      </VuiPanel>

      <VuiPanel className="p-4 md:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Truck className="h-4 w-4 text-red-600" aria-hidden />
          {t("conductores.form.workData")}
        </h3>
        <dl className="mt-3">
          <DetailRow label={t("conductores.form.company")}>{driver.companyLegalName}</DetailRow>
          <DetailRow label={t("conductores.detail.altaDate")}>{profile.altaDate}</DetailRow>
          <DetailRow label={t("conductores.form.license")}>{profile.license}</DetailRow>
          <DetailRow label={t("conductores.detail.currentVehicle")}>{profile.vehicle}</DetailRow>
          <DetailRow label={t("conductores.form.platforms")}>
            <MockPlatformDots platforms={platformLogos} />
          </DetailRow>
        </dl>
      </VuiPanel>

      <VuiPanel className="p-4 md:p-5 lg:col-span-2">
        <h3 className="text-sm font-bold text-zinc-900">{t("conductores.detail.appsStatus")}</h3>
        <p className="mt-1 text-xs text-zinc-500">{t("conductores.detail.appsStatusHint")}</p>
        <div className="mt-3">
          <ConductorPlataformasConexion rows={platformConnections} />
        </div>
      </VuiPanel>
    </div>
  );
}

function VehiculosTab({ rows }: { rows: DriverVehicleAssignmentRow[] }) {
  const { t } = useTranslations();
  if (rows.length === 0) {
    return (
      <VuiPanel className="p-8 text-center">
        <p className="text-sm text-zinc-600">{t("conductores.detail.vehiclesEmpty")}</p>
      </VuiPanel>
    );
  }

  return (
    <VuiPanel className="p-4 md:p-5">
      <h3 className="text-sm font-bold text-zinc-900">{t("conductores.detail.vehicleHistory")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{t("conductores.detail.vehicleHistoryHint")}</p>
      <VuiTableShell className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="vui-table-head">
            <tr>
              <th>{t("conductores.detail.vehicleColumns.plate")}</th>
              <th>{t("conductores.detail.vehicleColumns.model")}</th>
              <th>{t("conductores.detail.vehicleColumns.from")}</th>
              <th>{t("conductores.detail.vehicleColumns.to")}</th>
              <th>{t("conductores.detail.vehicleColumns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="vui-table-row">
                <td className="font-medium text-zinc-900">{row.vehiclePlate}</td>
                <td>{row.vehicleModel ?? "—"}</td>
                <td className="tabular-nums text-zinc-700">{row.assignedAt}</td>
                <td className="tabular-nums text-zinc-700">{row.unassignedAt ?? "—"}</td>
                <td>
                  {row.isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 ring-1 ring-emerald-200">
                      {t("conductores.detail.vehicleCurrent")}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">{t("conductores.detail.vehicleFinished")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </VuiTableShell>
    </VuiPanel>
  );
}

export function ConductorDetalleView({
  driver,
  stats,
  platformConnections = [],
  vehicleAssignments = [],
  canEditEconomics = false,
  companyDefaults,
}: {
  driver: ConductorDetalleDriver;
  stats: DriverDetailStats;
  platformConnections?: DriverPlatformConnectionRow[];
  vehicleAssignments?: DriverVehicleAssignmentRow[];
  canEditEconomics?: boolean;
  companyDefaults: CompanyEconomicDefaults;
}) {
  const [tab, setTab] = useState<TabId>("datos");
  const { t } = useTranslations();
  const profile = profileFromDriver(driver);

  return (
    <div className="space-y-4">
      {!stats.hasLiveData ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t("conductores.detail.noLiveData")}
        </p>
      ) : null}

      <VuiPanel className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-lg font-bold text-zinc-700"
            aria-hidden
          >
            {driverInitials(driver.fullName)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-900">{driver.fullName}</h2>
              {driver.isActive ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">
                  {t("conductores.active")}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                  {t("conductores.inactive")}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              {driver.companyLegalName}
              {profile.phone !== "—" ? ` · ${profile.phone}` : ""}
              {profile.email !== "—" ? (
                <>
                  {" · "}
                  <a href={`mailto:${profile.email}`} className="text-sky-600 hover:underline">
                    {profile.email}
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </VuiPanel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <VuiStatCard title={t("conductores.detail.stats.factToday")} value={stats.todayFacturacion} accent="green" />
        <VuiStatCard title={t("conductores.detail.stats.tripsToday")} value={String(stats.todayViajes)} accent="green" />
        <VuiStatCard title={t("conductores.detail.stats.hoursConnected")} value={stats.todayHoras} accent="green" />
        <VuiStatCard
          title={t("conductores.detail.stats.eurHour")}
          value={stats.todayEurH}
          accent="teal"
          valueClassName="text-emerald-600"
        />
      </div>

      <div className="erp-tabs-underline">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "erp-tab-underline erp-tab-underline-active-emerald pb-2.5 text-xs font-bold uppercase tracking-wide"
                : "erp-tab-underline pb-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 hover:text-zinc-800"
            }
          >
            {t(`conductores.detail.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === "datos" ? (
        <DatosTab
          profile={profile}
          driver={driver}
          platformConnections={platformConnections}
        />
      ) : null}
      {tab === "vehiculos" ? <VehiculosTab rows={vehicleAssignments} /> : null}
      {tab === "rendimiento" ? <DriverRendimientoTab performance={stats.performance} /> : null}
      {tab === "turnos" ? <DriverTurnosCerradosTab rows={stats.closedShifts} /> : null}
      {tab === "economico" ? (
        <ConductorEconomicoForm
          driverId={driver.id}
          driverSharePct={driver.driverSharePct ?? null}
          driverBonusSharePct={driver.driverBonusSharePct ?? null}
          driverPlatformFeeSharePct={driver.driverPlatformFeeSharePct ?? null}
          companyDefaults={companyDefaults}
          canEdit={canEditEconomics}
        />
      ) : null}
    </div>
  );
}
