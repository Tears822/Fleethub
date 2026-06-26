"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { PasswordInput } from "@/shared/ui/password-input";
import { useToast } from "@/shared/ui/toast-provider";
import { AuthPublicShell } from "./auth-public-shell";

export function ActivateAccountForm() {
  const { t } = useTranslations();
  const toast = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error(t("auth.activateInvalidLink"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/activate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.activateError"));
        return;
      }
      setDone(true);
      toast.success(t("auth.activateSuccessToast"));
    } catch {
      toast.error(t("auth.connectionErrorShort"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <LoadingOverlay
        open={loading}
        message={t("auth.activateSaving")}
        label={t("auth.activateSavingLabel")}
      />
      <AuthPublicShell title={t("auth.activateTitle")} subtitle={t("auth.activateSubtitle")}>
        {done ? (
          <p className="text-sm text-zinc-600">{t("auth.activateDone")}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="erp-label" htmlFor="pw">
                {t("auth.password")}
              </label>
              <PasswordInput
                id="pw"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={loading}
                required
              />
            </div>
            <div>
              <label className="erp-label" htmlFor="pw2">
                {t("auth.confirmPassword")}
              </label>
              <PasswordInput
                id="pw2"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                disabled={loading}
                required
              />
            </div>
            <button type="submit" disabled={loading || !token} className="erp-btn-primary w-full">
              {t("auth.activateSubmit")}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            {t("auth.goToLogin")}
          </Link>
        </p>
      </AuthPublicShell>
    </>
  );
}
