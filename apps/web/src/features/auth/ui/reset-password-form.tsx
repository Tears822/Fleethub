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

type PasswordFormVariant = "reset" | "setup";

export function ResetPasswordForm({ variant = "reset" }: { variant?: PasswordFormVariant }) {
  const { t } = useTranslations();
  const toast = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const title = variant === "reset" ? t("auth.resetTitle") : t("auth.setupPasswordTitle");
  const subtitle = variant === "reset" ? t("auth.resetSubtitle") : t("auth.setupPasswordSubtitle");
  const passwordLabel = variant === "reset" ? t("auth.newPassword") : t("auth.password");
  const submitLabel = variant === "reset" ? t("auth.savePassword") : t("auth.createPassword");
  const doneMessage = variant === "reset" ? t("auth.resetDone") : t("auth.setupDone");
  const successToast =
    variant === "reset" ? t("auth.passwordUpdatedToast") : t("auth.passwordCreatedToast");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error(t("auth.invalidLink"));
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
      const res = await fetch(buildApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.resetSaveError"));
        return;
      }
      setDone(true);
      toast.success(successToast);
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
        message={t("auth.saving")}
        label={t("auth.savingLabel")}
      />
      <AuthPublicShell title={title} subtitle={subtitle}>
        {done ? (
          <p className="text-sm text-zinc-600">{doneMessage}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="erp-label" htmlFor="pw">
                {passwordLabel}
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
              {submitLabel}
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
