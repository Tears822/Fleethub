"use client";

import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  SYSTEM_ECONOMIC_DEFAULTS,
  type CompanyEconomicDefaults,
} from "@fleethub/auth/company-economic-defaults";
import { DriverEconomicSplitGroup } from "@/features/drivers/ui/driver-economic-split-group";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

type Props = {
  driverId: string;
  driverSharePct: number | null;
  driverBonusSharePct: number | null;
  driverPlatformFeeSharePct: number | null;
  companyDefaults: CompanyEconomicDefaults;
  canEdit: boolean;
};

function displayPct(
  override: number | null,
  companyDefault: number | null,
  systemDefault: number,
): string {
  if (override != null) return String(override);
  if (companyDefault != null) return String(companyDefault);
  return String(systemDefault);
}

function parsePctInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (Number.isNaN(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function effectiveDefault(
  companyDefault: number | null,
  systemDefault: number,
): number | null {
  return companyDefault ?? systemDefault;
}

function toOverrideValue(
  parsed: number | null,
  companyDefault: number | null,
  systemDefault: number,
): number | null {
  if (parsed === null) return null;
  const baseline = effectiveDefault(companyDefault, systemDefault);
  if (parsed === baseline) return null;
  return parsed;
}

export function ConductorEconomicoForm({
  driverId,
  driverSharePct,
  driverBonusSharePct,
  driverPlatformFeeSharePct,
  companyDefaults,
  canEdit,
}: Props) {
  const toast = useToast();
  const { t } = useTranslations();
  const [revenueDriver, setRevenueDriver] = useState(
    displayPct(
      driverSharePct,
      companyDefaults.defaultDriverSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverSharePct,
    ),
  );
  const [bonusDriver, setBonusDriver] = useState(
    displayPct(
      driverBonusSharePct,
      companyDefaults.defaultDriverBonusSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverBonusSharePct,
    ),
  );
  const [platformDriver, setPlatformDriver] = useState(
    displayPct(
      driverPlatformFeeSharePct,
      companyDefaults.defaultDriverPlatformFeeSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverPlatformFeeSharePct,
    ),
  );
  const [loading, setLoading] = useState(false);

  const inheritsFromCompany =
    driverSharePct == null &&
    driverBonusSharePct == null &&
    driverPlatformFeeSharePct == null;

  const save = useCallback(async () => {
    const revenue = parsePctInput(revenueDriver);
    const bonus = parsePctInput(bonusDriver);
    const platform = parsePctInput(platformDriver);
    if (
      (revenueDriver.trim() && revenue === null) ||
      (bonusDriver.trim() && bonus === null) ||
      (platformDriver.trim() && platform === null)
    ) {
      toast.error(t("conductores.economic.pctInvalid"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/tenant/drivers/${driverId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverSharePct: toOverrideValue(
            revenue,
            companyDefaults.defaultDriverSharePct,
            SYSTEM_ECONOMIC_DEFAULTS.driverSharePct,
          ),
          driverBonusSharePct: toOverrideValue(
            bonus,
            companyDefaults.defaultDriverBonusSharePct,
            SYSTEM_ECONOMIC_DEFAULTS.driverBonusSharePct,
          ),
          driverPlatformFeeSharePct: toOverrideValue(
            platform,
            companyDefaults.defaultDriverPlatformFeeSharePct,
            SYSTEM_ECONOMIC_DEFAULTS.driverPlatformFeeSharePct,
          ),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("conductores.economic.saveError"));
        return;
      }
      toast.success(t("conductores.economic.saved"));
    } catch {
      toast.error(t("conductores.economic.connectionError"));
    } finally {
      setLoading(false);
    }
  }, [
    bonusDriver,
    companyDefaults,
    driverId,
    platformDriver,
    revenueDriver,
    t,
    toast,
  ]);

  return (
    <VuiPanel className="p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
        <h3 className="text-sm font-bold text-zinc-900">{t("conductores.economic.title")}</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        {t("conductores.economic.intro")}
        {inheritsFromCompany
          ? ` ${t("conductores.economic.inheritsCompany")}`
          : ` ${t("conductores.economic.customOverrides")}`}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <DriverEconomicSplitGroup
          title={t("conductores.economic.revenueSplit")}
          driverPct={revenueDriver}
          onDriverPctChange={setRevenueDriver}
          disabled={!canEdit || loading}
        />
        <DriverEconomicSplitGroup
          title={t("conductores.economic.bonusSplit")}
          driverPct={bonusDriver}
          onDriverPctChange={setBonusDriver}
          disabled={!canEdit || loading}
        />
        <DriverEconomicSplitGroup
          title={t("conductores.economic.platformFee")}
          driverPct={platformDriver}
          onDriverPctChange={setPlatformDriver}
          disabled={!canEdit || loading}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-4">
        {!canEdit ? (
          <p className="mr-auto text-xs text-amber-800">{t("conductores.economic.readOnlyHint")}</p>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className="erp-btn-success px-6"
            disabled={loading}
            onClick={() => void save()}
          >
            {loading ? t("common.saving") : t("account.saveChanges")}
          </button>
        ) : null}
      </div>
    </VuiPanel>
  );
}
