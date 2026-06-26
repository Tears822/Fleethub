"use client";

import { useCallback, useState } from "react";
import type { TenantIntegrationSettings } from "@/features/settings/server/settings.queries";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export function ConfiguracionIntegrationPlatformSection({
  initial,
  canEdit,
  showPlatformTenantIds = false,
}: {
  initial: TenantIntegrationSettings;
  canEdit: boolean;
  /** FreeNow public company id + Uber org id — Super Admin only. */
  showPlatformTenantIds?: boolean;
}) {
  const toast = useToast();
  const { t } = useTranslations();
  const [freenowPublicCompanyId, setFreenowPublicCompanyId] = useState(
    initial.freenowPublicCompanyId,
  );
  const [uberOrgId, setUberOrgId] = useState(initial.uberOrgId);
  const [uberSyncDays, setUberSyncDays] = useState(String(initial.uberSyncDays));
  const [freenowSyncDays, setFreenowSyncDays] = useState(String(initial.freenowSyncDays));
  const [pollingMinutesUber, setPollingMinutesUber] = useState(String(initial.pollingMinutesUber));
  const [pollingMinutesFreeNow, setPollingMinutesFreeNow] = useState(
    String(initial.pollingMinutesFreeNow),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/settings/integrations"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(showPlatformTenantIds
            ? { freenowPublicCompanyId, uberOrgId }
            : {}),
          uberSyncDays: Number(uberSyncDays),
          freenowSyncDays: Number(freenowSyncDays),
          pollingMinutesUber: Number(pollingMinutesUber),
          pollingMinutesFreeNow: Number(pollingMinutesFreeNow),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("config.integrations.platform.saveError"));
        return;
      }
      toast.success(t("config.integrations.platform.saved"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }, [
    freenowPublicCompanyId,
    pollingMinutesFreeNow,
    pollingMinutesUber,
    showPlatformTenantIds,
    t,
    toast,
    uberOrgId,
    uberSyncDays,
    freenowSyncDays,
  ]);

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
        {t("config.integrations.platform.title")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600">
        {t("config.integrations.platform.intro")}
        {showPlatformTenantIds
          ? t("config.integrations.platform.introSuperAdmin")
          : t("config.integrations.platform.introTenant")}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {showPlatformTenantIds ? (
          <>
            <label className="block text-xs text-zinc-700">
              <span className="font-medium">{t("config.integrations.platform.freenowCompanyId")}</span>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
                value={freenowPublicCompanyId}
                onChange={(e) => setFreenowPublicCompanyId(e.target.value)}
                placeholder="GEYTMOBQGE"
                disabled={!canEdit}
                readOnly={!canEdit}
              />
            </label>
            <label className="block text-xs text-zinc-700">
              <span className="font-medium">{t("config.integrations.platform.uberOrgId")}</span>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-mono text-[11px]"
                value={uberOrgId}
                onChange={(e) => setUberOrgId(e.target.value)}
                placeholder={t("config.integrations.platform.uberOrgPlaceholder")}
                disabled={!canEdit}
                readOnly={!canEdit}
              />
            </label>
          </>
        ) : null}
        <label className="block text-xs text-zinc-700">
          <span className="font-medium">{t("config.integrations.platform.uberSyncDays")}</span>
          <input
            type="number"
            min={1}
            max={28}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
            value={uberSyncDays}
            onChange={(e) => setUberSyncDays(e.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="block text-xs text-zinc-700">
          <span className="font-medium">{t("config.integrations.platform.uberPolling")}</span>
          <input
            type="number"
            min={5}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
            value={pollingMinutesUber}
            onChange={(e) => setPollingMinutesUber(e.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="block text-xs text-zinc-700">
          <span className="font-medium">{t("config.integrations.platform.freenowSyncDays")}</span>
          <input
            type="number"
            min={1}
            max={28}
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
            value={freenowSyncDays}
            onChange={(e) => setFreenowSyncDays(e.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="block text-xs text-zinc-700">
          <span className="font-medium">{t("config.integrations.platform.freenowPolling")}</span>
          <input
            type="number"
            min={5}
            className="mt-1 w-full max-w-xs rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
            value={pollingMinutesFreeNow}
            onChange={(e) => setPollingMinutesFreeNow(e.target.value)}
            disabled={!canEdit}
          />
        </label>
      </div>
      {canEdit ? (
        <button
          type="button"
          className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving
            ? t("common.saving")
            : showPlatformTenantIds
              ? t("config.integrations.saveIntegration")
              : t("config.integrations.saveSettings")}
        </button>
      ) : null}
    </div>
  );
}
