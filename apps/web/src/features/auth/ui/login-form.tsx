"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { buildApiUrl } from "@/shared/lib/api-url";
import { getPublicAppUrl } from "@/shared/config/public-env";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { PasswordInput } from "@/shared/ui/password-input";
import { useToast } from "@/shared/ui/toast-provider";

type LoginStep = "credentials" | "2fa";

export function LoginForm() {
  const { t } = useTranslations();
  const toast = useToast();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [redirectTo, setRedirectTo] = useState("/dashboard");
  const [loading, setLoading] = useState(false);

  function goToApp(path: string) {
    const next = path.startsWith("/") ? path : "/dashboard";
    window.location.assign(`/auth/loading?next=${encodeURIComponent(next)}`);
  }

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reason?: string;
        redirectTo?: string;
        requires2fa?: boolean;
        requiresMfaSetup?: boolean;
        pendingToken?: string;
      };
      if (!res.ok) {
        if (data.reason === "email_not_verified") {
          toast.error(data.error ?? t("auth.verifyEmailFirst"));
        } else {
          toast.error(data.error ?? t("auth.loginError"));
        }
        return;
      }
      if (data.requires2fa && data.pendingToken) {
        setPendingToken(data.pendingToken);
        setRedirectTo(data.redirectTo ?? "/dashboard");
        setStep("2fa");
        setTotpCode("");
        return;
      }
      if (data.requiresMfaSetup) {
        toast.info(
          data.redirectTo?.includes("super-admin")
            ? t("auth.setup2faSuperAdmin")
            : t("auth.recommend2fa"),
        );
      }
      goToApp(data.redirectTo ?? "/dashboard");
    } catch {
      toast.error(t("auth.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit2fa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/login/2fa"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code: totpCode.trim() }),
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.codeIncorrect"));
        return;
      }
      goToApp(data.redirectTo ?? redirectTo);
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
        message={step === "2fa" ? t("auth.verifying2fa") : t("auth.loggingIn")}
        label={step === "2fa" ? t("auth.verifying2faLabel") : t("auth.loggingInLabel")}
      />

      <div className="relative min-h-screen bg-zinc-100">
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <LocaleSwitcher mode="guest" />
        </div>
        <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:py-16">
          <div className="max-w-lg space-y-5 text-zinc-900 lg:flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 transition hover:text-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t("auth.backToHome")}
            </Link>
            <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
                <BrandLogo size={32} className="h-full w-full object-contain" />
              </span>
              FleetHub
            </p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
              {t("auth.loginHeroTitle")}
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 lg:text-base">
              {t("auth.loginHeroSubtitle")}
            </p>
            <p className="text-xs text-zinc-500">
              {t("auth.publicOrigin")}{" "}
              <code className="break-all rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-700">
                {getPublicAppUrl()}
              </code>
            </p>
          </div>

          <div className="w-full max-w-md lg:w-[440px] lg:flex-shrink-0">
            <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
              {step === "credentials" ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    {t("auth.accessLabel")}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-zinc-900">{t("auth.login")}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{t("auth.credentialsHint")}</p>

                  <form onSubmit={onSubmitCredentials} className="mt-8 space-y-5">
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
                        disabled={loading}
                        required
                      />
                    </div>
                    <div>
                      <label className="erp-label" htmlFor="pw">
                        {t("auth.password")}
                      </label>
                      <PasswordInput
                        id="pw"
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                        disabled={loading}
                        required
                      />
                    </div>
                    <button type="submit" disabled={loading} className="erp-btn-primary w-full">
                      <LogIn className="h-4 w-4" aria-hidden />
                      {loading ? t("auth.entering") : t("auth.enter")}
                    </button>
                  </form>
                  <p className="mt-4 text-center text-sm text-zinc-600">
                    <Link href="/olvide-contrasena" className="text-orange-600 hover:text-orange-700">
                      {t("auth.forgotPassword")}
                    </Link>
                    <span className="mx-2 text-zinc-300">·</span>
                    <Link href="/registro" className="text-orange-600 hover:text-orange-700">
                      {t("auth.createAccount")}
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    {t("auth.twoFaLabel")}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-zinc-900">{t("auth.twoFaTitle")}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{t("auth.twoFaSubtitle")}</p>
                  <form onSubmit={onSubmit2fa} className="mt-8 space-y-5">
                    <div>
                      <label className="erp-label" htmlFor="totp">
                        {t("auth.code")}
                      </label>
                      <input
                        id="totp"
                        className="erp-input font-mono tracking-widest"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                    <button type="submit" disabled={loading} className="erp-btn-primary w-full">
                      {loading ? t("auth.verifying") : t("auth.continue")}
                    </button>
                    <button
                      type="button"
                      className="erp-btn-outline w-full normal-case"
                      disabled={loading}
                      onClick={() => {
                        setStep("credentials");
                        setPendingToken("");
                        setTotpCode("");
                      }}
                    >
                      {t("common.back")}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
