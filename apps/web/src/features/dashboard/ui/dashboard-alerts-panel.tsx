"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Info } from "lucide-react";
import type { DashboardAlertItem } from "@/features/dashboard/server/dashboard-alerts.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

function iconFor(severity: DashboardAlertItem["severity"]) {
  if (severity === "danger") return AlertTriangle;
  if (severity === "warning") return Bell;
  return Info;
}

function borderFor(severity: DashboardAlertItem["severity"]) {
  if (severity === "danger") return "border-red-200 bg-red-50";
  if (severity === "warning") return "border-amber-200 bg-amber-50";
  return "border-sky-200 bg-sky-50";
}

export function DashboardAlertsPanel({
  alerts,
  headerAction,
}: {
  alerts: DashboardAlertItem[];
  headerAction?: ReactNode;
}) {
  const { t } = useTranslations();

  return (
    <VuiPanel className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Bell className="h-4 w-4 text-violet-600" aria-hidden />
          {t("dashboard.alertsPanel")}
        </h2>
        {headerAction}
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => {
          const Icon = iconFor(a.severity);
          const content = (
            <li
              key={a.id}
              className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${borderFor(a.severity)}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900">{a.title}</p>
                <p className="mt-0.5 text-xs text-zinc-700">{a.description}</p>
              </div>
            </li>
          );
          if (a.href) {
            return (
              <Link key={a.id} href={a.href} className="block transition hover:opacity-90">
                {content}
              </Link>
            );
          }
          return content;
        })}
      </ul>
    </VuiPanel>
  );
}
