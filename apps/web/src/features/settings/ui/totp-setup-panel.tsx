"use client";

import { useCallback, useEffect, useState } from "react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { TotpQrCode } from "./totp-qr-code";

type TotpStatus = {
  enabled: boolean;
  canDisable: boolean;
};

export function TotpSetupPanel() {
  const toast = useToast();
  const { t } = useTranslations();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/totp/status"), {
        credentials: "include",
      });
      const data = (await res.json()) as TotpStatus & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("account.totp.statusLoadError"));
        return;
      }
      setStatus({ enabled: data.enabled, canDisable: data.canDisable });
    } catch {
      toast.error(t("shell.serverError"));
    } finally {
      setStatusLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const beginSetup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/totp/begin"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        error?: string;
        uri?: string;
        secret?: string;
        backupCodes?: string[];
      };
      if (!res.ok) {
        toast.error(data.error ?? t("account.totp.beginError"));
        return;
      }
      setUri(data.uri ?? null);
      setSecret(data.secret ?? null);
      setBackupCodes(data.backupCodes ?? []);
      toast.info(t("account.totp.scanToast"));
    } catch {
      toast.error(t("shell.serverError"));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  const confirmSetup = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t("account.totp.codeRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/totp/confirm"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await res.json()) as { error?: string; backupCodes?: string[] };
      if (!res.ok) {
        toast.error(data.error ?? t("account.totp.codeWrong"));
        return;
      }
      if (data.backupCodes?.length) setBackupCodes(data.backupCodes);
      setUri(null);
      setSecret(null);
      setCode("");
      toast.success(t("account.totp.enabled"));
      await loadStatus();
    } catch {
      toast.error(t("shell.serverError"));
    } finally {
      setLoading(false);
    }
  }, [code, loadStatus, t, toast]);

  const disable2fa = useCallback(async () => {
    if (!disableCode.trim()) {
      toast.error(t("account.totp.disableCodeRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/totp/disable"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("account.totp.disableError"));
        return;
      }
      setShowDisableForm(false);
      setDisableCode("");
      setUri(null);
      setSecret(null);
      setBackupCodes([]);
      toast.success(t("account.totp.disabled"));
      await loadStatus();
    } catch {
      toast.error(t("shell.serverError"));
    } finally {
      setLoading(false);
    }
  }, [disableCode, loadStatus, t, toast]);

  const enabled = status?.enabled ?? false;
  const canDisable = status?.canDisable ?? true;

  return (
    <VuiPanel className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{t("account.totp.title")}</h2>
      <p className="mt-1 text-xs text-zinc-600">{t("account.totp.subtitle")}</p>

      {statusLoading ? (
        <p className="mt-4 text-sm text-zinc-500">{t("account.totp.loading")}</p>
      ) : enabled ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-emerald-700">{t("account.totp.active")}</p>
          {canDisable ? (
            <>
              {!showDisableForm ? (
                <button
                  type="button"
                  onClick={() => setShowDisableForm(true)}
                  disabled={loading}
                  className="erp-btn-secondary text-red-700 border-red-200 hover:bg-red-50"
                >
                  {t("account.totp.disable")}
                </button>
              ) : (
                <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs text-zinc-600">{t("account.totp.disableHint")}</p>
                  <label className="block text-xs font-medium text-zinc-600">
                    {t("account.totp.verifyCode")}
                    <input
                      className="erp-inline-input mt-1 w-full max-w-xs font-mono"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={loading}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void disable2fa()}
                      disabled={loading}
                      className="erp-btn-primary bg-red-600 hover:bg-red-700"
                    >
                      {t("account.totp.confirmDisable")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDisableForm(false);
                        setDisableCode("");
                      }}
                      disabled={loading}
                      className="erp-btn-secondary"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-amber-800">{t("account.totp.superAdminNoDisable")}</p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!uri ? (
            <button type="button" onClick={() => void beginSetup()} disabled={loading} className="erp-btn-primary">
              {t("account.totp.setup")}
            </button>
          ) : (
            <>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <TotpQrCode uri={uri} />
                <div className="space-y-1 text-xs text-zinc-600">
                  <p>{t("account.totp.scanHint")}</p>
                  {secret ? (
                    <p>
                      {t("account.totp.manualKey")}{" "}
                      <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">{secret}</code>
                    </p>
                  ) : null}
                </div>
              </div>
              {backupCodes.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">{t("account.totp.backupCodesTitle")}</p>
                  <ul className="mt-2 font-mono">
                    {backupCodes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className="block text-xs font-medium text-zinc-600">
                {t("account.totp.verifyCode")}
                <input
                  className="erp-inline-input mt-1 w-full max-w-xs font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  disabled={loading}
                />
              </label>
              <button type="button" onClick={() => void confirmSetup()} disabled={loading} className="erp-btn-primary">
                {t("account.totp.confirmSetup")}
              </button>
            </>
          )}
        </div>
      )}
    </VuiPanel>
  );
}
