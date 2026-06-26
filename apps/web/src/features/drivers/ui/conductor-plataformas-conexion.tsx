"use client";

import type { DriverPlatformConnectionRow } from "@/features/drivers/server/driver-platform-connections.queries";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import { appsPlatformLogoId, ridePlatformToSlug } from "@/features/apps/lib/apps-platform";
import { useTranslations } from "@/shared/i18n/i18n-provider";

const dotClass: Record<DriverPlatformConnectionRow["connectionDot"], string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  unknown: "bg-zinc-400",
};

export function ConductorPlataformasConexion({
  rows,
}: {
  rows: DriverPlatformConnectionRow[];
}) {
  const { t } = useTranslations();
  if (rows.length === 0) {
    return (
      <p className="text-xs text-zinc-500">{t("conductores.detail.noPlatformAccounts")}</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {rows.map((row) => (
        <li
          key={row.platform}
          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <PlatformLogo id={appsPlatformLogoId(ridePlatformToSlug(row.platform))} size="md" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-900">{row.platform}</p>
              {row.externalDriverId ? (
                <p className="truncate font-mono text-[10px] text-zinc-500">
                  {row.externalDriverId}
                </p>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${dotClass[row.connectionDot]}`}
                aria-hidden
              />
              <span className="text-xs font-medium text-zinc-800">{row.connectionLabel}</span>
            </div>
            {row.checkedAt ? (
              <p className="mt-0.5 text-[10px] text-zinc-500">{row.checkedAt}</p>
            ) : null}
            {row.viajesHoy > 0 ? (
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {t("conductores.detail.tripsToday", { count: row.viajesHoy })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
