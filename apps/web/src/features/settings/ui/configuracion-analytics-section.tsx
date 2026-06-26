"use client";

import { useCallback, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { TenantAnalyticsSettings } from "@fleethub/auth/tenant-analytics-settings";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

export function ConfiguracionAnalyticsSection({
  initial,
  canEdit = false,
}: {
  initial: TenantAnalyticsSettings;
  canEdit?: boolean;
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const [optIn, setOptIn] = useState(initial.sectorBenchmarkOptIn);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/settings/analytics"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorBenchmarkOptIn: optIn }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("config.analytics.saveError"));
        return;
      }
      toast.success(t("config.analytics.saved"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }, [optIn, t, toast]);

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{t("config.analytics.title")}</h2>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          disabled={!canEdit}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
        />
        <span className="text-xs leading-relaxed text-zinc-700">
          <span className="font-medium text-zinc-900">{t("config.analytics.sectorBenchmarkOptIn")}</span>{" "}
          — {t("config.analytics.sectorBenchmarkHint")}
        </span>
      </label>
      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="erp-btn-primary disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">{t("config.analytics.adminOnly")}</p>
      )}
    </VuiPanel>
  );
}
