"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CompanyProfile } from "@/features/companies/lib/company-profile";
import { DriverEconomicSplitGroup } from "@/features/drivers/ui/driver-economic-split-group";
import { VuiPanel } from "@/shared/ui/vui-panel";

function pctToInput(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

type Props = {
  profile?: CompanyProfile;
  readOnly?: boolean;
};

export function EmpresaEconomicoSection({ profile, readOnly = false }: Props) {
  return (
    <VuiPanel className="p-4 md:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
        <h3 className="text-sm font-bold text-zinc-900">Configuración económica</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        Valores por defecto para todos los conductores de esta empresa. Los conductores pueden
        personalizarlos en su ficha; si no tienen configuración propia, heredan estos repartos.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {readOnly ? (
          <>
            <DriverEconomicSplitGroup
              title="Reparto de recaudación"
              driverPct={pctToInput(profile?.defaultDriverSharePct)}
              onDriverPctChange={() => {}}
              disabled
            />
            <DriverEconomicSplitGroup
              title="Reparto de primas"
              driverPct={pctToInput(profile?.defaultDriverBonusSharePct)}
              onDriverPctChange={() => {}}
              disabled
            />
            <DriverEconomicSplitGroup
              title="Comisión plataforma"
              driverPct={pctToInput(profile?.defaultDriverPlatformFeeSharePct)}
              onDriverPctChange={() => {}}
              disabled
            />
          </>
        ) : (
          <EmpresaEconomicoFormFields profile={profile} />
        )}
      </div>
    </VuiPanel>
  );
}

function EmpresaEconomicoFormFields({ profile }: { profile?: CompanyProfile }) {
  const [revenue, setRevenue] = useState(pctToInput(profile?.defaultDriverSharePct));
  const [bonus, setBonus] = useState(pctToInput(profile?.defaultDriverBonusSharePct));
  const [platform, setPlatform] = useState(pctToInput(profile?.defaultDriverPlatformFeeSharePct));

  return (
    <>
      <input type="hidden" name="defaultDriverSharePct" value={revenue} />
      <input type="hidden" name="defaultDriverBonusSharePct" value={bonus} />
      <input type="hidden" name="defaultDriverPlatformFeeSharePct" value={platform} />
      <DriverEconomicSplitGroup
        title="Reparto de recaudación"
        driverPct={revenue}
        onDriverPctChange={setRevenue}
      />
      <DriverEconomicSplitGroup
        title="Reparto de primas"
        driverPct={bonus}
        onDriverPctChange={setBonus}
      />
      <DriverEconomicSplitGroup
        title="Comisión plataforma"
        driverPct={platform}
        onDriverPctChange={setPlatform}
      />
    </>
  );
}
