"use client";

import { useState } from "react";
import Link from "next/link";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { useToast } from "@/shared/ui/toast-provider";
import { AuthPublicShell } from "./auth-public-shell";

export function ForgotPasswordForm() {
  const { t } = useTranslations();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.forgotSendError"));
        return;
      }
      setSent(true);
      toast.success(t("auth.forgotSentToast"));
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
        message={t("auth.forgotSending")}
        label={t("auth.forgotSendingLabel")}
      />
      <AuthPublicShell title={t("auth.forgotTitle")} subtitle={t("auth.forgotSubtitle")}>
        {sent ? (
          <p className="text-sm text-zinc-600">{t("auth.forgotSentBody")}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="erp-label" htmlFor="email">
                {t("auth.email")}
              </label>
              <input
                id="email"
                type="email"
                className="erp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <button type="submit" disabled={loading} className="erp-btn-primary w-full">
              {t("auth.forgotSendLink")}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            {t("auth.backToLogin")}
          </Link>
        </p>
      </AuthPublicShell>
    </>
  );
}
