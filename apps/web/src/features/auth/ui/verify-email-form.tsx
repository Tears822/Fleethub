"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { useToast } from "@/shared/ui/toast-provider";
import { AuthPublicShell } from "./auth-public-shell";

type VerifyState = "pending" | "verified" | "redirecting" | "error";

export function VerifyEmailForm() {
  const { t } = useTranslations();
  const toast = useToast();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState>(
    tokenFromUrl ? "pending" : "pending",
  );
  const autoVerifyStarted = useRef(false);

  const verifyToken = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const res = await fetch(buildApiUrl("/api/auth/verify-email"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as {
          error?: string;
          needsPasswordSetup?: boolean;
          setupToken?: string;
        };
        if (!res.ok) {
          setVerifyState("error");
          toast.error(data.error ?? t("auth.verifyError"));
          return;
        }

        if (data.needsPasswordSetup && data.setupToken) {
          setVerifyState("redirecting");
          toast.success(t("auth.verifySuccessPassword"));
          window.location.assign(
            `/crear-contrasena?token=${encodeURIComponent(data.setupToken)}`,
          );
          return;
        }

        setVerifyState("verified");
        toast.success(t("auth.verifySuccessLogin"));
      } catch {
        setVerifyState("error");
        toast.error(t("auth.connectionErrorShort"));
      } finally {
        setLoading(false);
      }
    },
    [t, toast],
  );

  useEffect(() => {
    if (!tokenFromUrl || autoVerifyStarted.current) return;
    autoVerifyStarted.current = true;
    void verifyToken(tokenFromUrl);
  }, [tokenFromUrl, verifyToken]);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error(t("auth.verifyEnterEmail"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.verifyResendError"));
        return;
      }
      toast.success(t("auth.verifyResendToast"));
    } catch {
      toast.error(t("auth.connectionErrorShort"));
    } finally {
      setLoading(false);
    }
  }

  const showResendOnly = !tokenFromUrl;
  const verifyingFromLink =
    Boolean(tokenFromUrl) && (verifyState === "pending" || verifyState === "redirecting");

  return (
    <>
      <LoadingOverlay
        open={loading || verifyingFromLink}
        message={
          verifyState === "redirecting" ? t("auth.verifyRedirecting") : t("auth.verifyChecking")
        }
        label={t("auth.verifyCheckingLabel")}
      />
      <AuthPublicShell
        title={t("auth.verifyTitle")}
        subtitle={
          tokenFromUrl ? t("auth.verifySubtitleConfirm") : t("auth.verifySubtitleResend")
        }
      >
        {verifyState === "verified" ? (
          <p className="text-sm text-zinc-600">
            {t("auth.verifyDone")}{" "}
            <Link href="/login" className="font-medium text-orange-600">
              {t("auth.login")}
            </Link>
          </p>
        ) : showResendOnly ? (
          <form onSubmit={onResend} className="space-y-4">
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
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" disabled={loading} className="erp-btn-primary w-full">
              {t("auth.verifyResendLink")}
            </button>
          </form>
        ) : verifyState === "error" ? (
          <p className="text-sm text-zinc-600">
            {t("auth.verifyInvalidLink")}{" "}
            <Link href="/verificar-email" className="font-medium text-orange-600">
              {t("auth.verifyEmail")}
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-zinc-600">{t("auth.verifyPending")}</p>
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
