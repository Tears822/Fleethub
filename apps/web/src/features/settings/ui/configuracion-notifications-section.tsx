"use client";

import { useCallback, useState } from "react";
import { Mail } from "lucide-react";
import type { TenantNotificationSettings } from "@/features/settings/lib/tenant-settings-types";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

type Props = {
  initial: TenantNotificationSettings;
  smtpConfigured: boolean;
};

export function ConfiguracionNotificationsSection({ initial, smtpConfigured }: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const setFlag = useCallback(
    (key: keyof TenantNotificationSettings, value: boolean) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/settings/notifications"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("config.notifications.saveError"));
        return;
      }
      toast.success(t("config.notifications.saved"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }, [settings, t, toast]);

  const handleSendTest = useCallback(async () => {
    setSending(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/notifications/send-digest"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alerts: [
            {
              id: "test",
              title: t("config.notifications.testEmailTitle"),
              description: t("config.notifications.testEmailDescription"),
            },
          ],
        }),
      });
      const data = (await res.json()) as { error?: string; sent?: number };
      if (!res.ok) {
        toast.error(data.error ?? t("config.notifications.testEmailError"));
        return;
      }
      toast.success(t("config.notifications.testEmailSent", { count: data.sent ?? 0 }));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSending(false);
    }
  }, [t, toast]);

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{t("config.notifications.title")}</h2>
      </div>

      <p
        className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
          smtpConfigured
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {smtpConfigured
          ? t("config.notifications.smtpConfigured")
          : t("config.notifications.smtpNotConfigured")}
      </p>

      <ul className="space-y-3 text-sm text-zinc-700">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={settings.emailOnPendingShifts}
            onChange={(e) => setFlag("emailOnPendingShifts", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="font-medium text-zinc-900">{t("config.notifications.pendingShifts")}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              {t("config.notifications.pendingShiftsHint")}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={settings.emailOnProductivityLow}
            onChange={(e) => setFlag("emailOnProductivityLow", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="font-medium text-zinc-900">{t("config.notifications.productivityLow")}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              {t("config.notifications.productivityLowHint")}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={settings.emailOnSyncStale}
            onChange={(e) => setFlag("emailOnSyncStale", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="font-medium text-zinc-900">{t("config.notifications.syncStale")}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              {t("config.notifications.syncStaleHint")}
            </span>
          </span>
        </label>
      </ul>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleSendTest()}
          disabled={sending || !smtpConfigured}
          className="erp-btn-outline px-4 text-xs"
          title={!smtpConfigured ? t("config.notifications.smtpRequired") : undefined}
        >
          {sending ? t("config.notifications.sendingTest") : t("config.notifications.sendTest")}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="erp-btn-primary px-6"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </VuiPanel>
  );
}
