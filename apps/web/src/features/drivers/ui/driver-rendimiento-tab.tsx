"use client";

import type { DriverPerformanceStats } from "@/features/drivers/lib/driver-performance-types";
import { formatEuroFromCents } from "@/shared/lib/format-euro";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiStatCard } from "@/shared/ui/vui-stat-card";

function formatEuro(n: number): string {
  return formatEuroFromCents(Math.round(n * 100));
}

function BarChart({
  items,
  maxValue,
  barClass = "bg-emerald-500",
}: {
  items: Array<{ label: string; value: number; highlight?: boolean }>;
  maxValue: number;
  barClass?: string;
}) {
  const max = Math.max(maxValue, 1);
  return (
    <div className="flex h-40 items-end gap-1 border-b border-zinc-200 pb-1 pt-2">
      {items.map((item) => {
        const pct = Math.max(4, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center">
              <div
                className={`w-full max-w-[2rem] rounded-t ${item.highlight ? "bg-emerald-600" : barClass}`}
                style={{ height: `${pct}%` }}
                title={`${item.label}: ${formatEuro(item.value)}`}
              />
            </div>
            <span className="text-[9px] text-zinc-500">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBars({
  items,
}: {
  items: Array<{ name: string; amountEur: number; isCurrent: boolean }>;
}) {
  const max = Math.max(...items.map((i) => i.amountEur), 1);
  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const pct = Math.round((item.amountEur / max) * 100);
        return (
          <li key={`${item.name}-${item.amountEur}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={item.isCurrent ? "font-bold text-emerald-700" : "text-zinc-800"}>
                {item.isCurrent ? `#${index + 1} ${item.name}` : item.name}
              </span>
              <span className="tabular-nums font-semibold text-zinc-900">
                {formatEuro(item.amountEur)}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full ${item.isCurrent ? "bg-emerald-600" : "bg-zinc-400"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DriverRendimientoTab({
  performance,
}: {
  performance: DriverPerformanceStats | null;
}) {
  const { t } = useTranslations();

  if (!performance) {
    return (
      <VuiPanel className="p-8 text-center">
        <p className="text-sm text-zinc-600">{t("conductores.rendimiento.empty")}</p>
      </VuiPanel>
    );
  }

  const dailyMax = Math.max(...performance.dailyBilling.map((d) => d.amountEur), 1);
  const evolutionMax = Math.max(...performance.evolution6m.map((m) => m.amountEur), 1);
  const dailyItems = performance.dailyBilling.map((d) => ({
    label: String(d.day),
    value: d.amountEur,
  }));

  const vsPrev =
    performance.facturacionVsPrevPct === null
      ? null
      : performance.facturacionVsPrevPct >= 0
        ? t("conductores.rendimiento.vsPrevUp", { pct: performance.facturacionVsPrevPct })
        : t("conductores.rendimiento.vsPrevDown", {
            pct: Math.abs(performance.facturacionVsPrevPct),
          });

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">{t("conductores.rendimiento.dataHint")}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <VuiStatCard
          title={t("conductores.rendimiento.facturacionMes")}
          value={performance.facturacionMes}
          hint={vsPrev ?? t("conductores.rendimiento.noPrevMonth")}
          accent="green"
        />
        <VuiStatCard
          title={t("conductores.rendimiento.viajesMes")}
          value={String(performance.viajesMes)}
          hint={t("conductores.rendimiento.tripsPerDay", {
            label: performance.viajesPerDayLabel,
          })}
          accent="green"
        />
        <VuiStatCard
          title={t("conductores.rendimiento.eurHoraMes")}
          value={`${performance.eurHoraMes} €`}
          hint={performance.horasMesLabel}
          accent="teal"
          valueClassName="text-emerald-600"
        />
        <VuiStatCard
          title={t("conductores.rendimiento.ranking")}
          value={performance.rankingPosition ? `#${performance.rankingPosition}` : "—"}
          hint={
            performance.rankingTotal > 0
              ? t("conductores.rendimiento.rankingOf", { total: performance.rankingTotal })
              : t("conductores.rendimiento.noRanking")
          }
          accent="green"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VuiPanel className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900">
              {t("conductores.rendimiento.dailyBillingTitle", { month: performance.monthTitle })}
            </h3>
            <span className="text-sm font-semibold text-emerald-700">
              {performance.dailyBillingTotal}
            </span>
          </div>
          {dailyItems.length > 0 ? (
            <div className="mt-4">
              <BarChart items={dailyItems} maxValue={dailyMax} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              {t("conductores.rendimiento.noTripsThisMonth")}
            </p>
          )}
        </VuiPanel>

        <VuiPanel className="p-4 md:p-5">
          <h3 className="text-sm font-bold text-zinc-900">
            {t("conductores.rendimiento.evolution6m")}
          </h3>
          <div className="mt-4">
            <BarChart
              items={performance.evolution6m.map((m) => ({
                label: m.label,
                value: m.amountEur,
              }))}
              maxValue={evolutionMax}
              barClass="bg-sky-500"
            />
          </div>
        </VuiPanel>
      </div>

      {performance.peerComparison.length > 0 ? (
        <VuiPanel className="p-4 md:p-5">
          <h3 className="text-sm font-bold text-zinc-900">
            {t("conductores.rendimiento.peerComparison")}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">{t("conductores.rendimiento.peerHint")}</p>
          <div className="mt-4">
            <HorizontalBars items={performance.peerComparison} />
          </div>
        </VuiPanel>
      ) : null}
    </div>
  );
}
