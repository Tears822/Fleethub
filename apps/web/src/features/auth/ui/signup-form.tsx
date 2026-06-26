"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { PasswordInput } from "@/shared/ui/password-input";
import { useToast } from "@/shared/ui/toast-provider";
import { AuthPublicShell } from "./auth-public-shell";

export function SignupForm() {
  const { t } = useTranslations();
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [operatorName, setOperatorName] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetch(buildApiUrl("/api/auth/signup/enabled"))
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorName: operatorName.trim(),
          companyLegalName: companyLegalName.trim() || operatorName.trim(),
          companyTaxId: companyTaxId.trim() || undefined,
          adminEmail: adminEmail.trim().toLowerCase(),
          adminPassword,
          adminFirstName: adminFirstName.trim() || undefined,
          adminLastName: adminLastName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("auth.signupError"));
        return;
      }
      setDone(true);
      toast.success(t("auth.signupSuccessEmail"));
    } catch {
      toast.error(t("auth.connectionErrorShort"));
    } finally {
      setLoading(false);
    }
  }

  if (enabled === null) {
    return (
      <AuthPublicShell title={t("auth.signupTitle")} subtitle={t("auth.signupLoading")}>
        <p className="text-sm text-zinc-600">{t("auth.signupChecking")}</p>
      </AuthPublicShell>
    );
  }

  if (!enabled) {
    return (
      <AuthPublicShell
        title={t("auth.signupUnavailableTitle")}
        subtitle={t("auth.signupUnavailableSubtitle")}
      >
        <p className="text-sm text-zinc-600">{t("auth.signupUnavailableBody")}</p>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            {t("auth.goToLogin")}
          </Link>
        </p>
      </AuthPublicShell>
    );
  }

  return (
    <>
      <LoadingOverlay
        open={loading}
        message={t("auth.signupCreating")}
        label={t("auth.signupCreatingLabel")}
      />
      <AuthPublicShell title={t("auth.signupTitle")} subtitle={t("auth.signupSubtitle")}>
        {done ? (
          <div className="space-y-3 text-sm text-zinc-600">
            <p>{t("auth.signupDoneIntro", { email: adminEmail })}</p>
            <p>
              {t("auth.signupDoneResend")}{" "}
              <Link href="/login" className="font-medium text-orange-600">
                {t("auth.login")}
              </Link>{" "}
              {t("auth.signupDoneOrResend")}{" "}
              <Link href="/verificar-email" className="font-medium text-orange-600">
                {t("auth.verifyEmail")}
              </Link>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="erp-label" htmlFor="operator">
                {t("auth.operatorName")}
              </label>
              <input
                id="operator"
                className="erp-input"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="erp-label" htmlFor="company">
                {t("auth.companyLegalName")}
              </label>
              <input
                id="company"
                className="erp-input"
                value={companyLegalName}
                onChange={(e) => setCompanyLegalName(e.target.value)}
                placeholder={t("auth.companyLegalPlaceholder")}
                disabled={loading}
              />
            </div>
            <div>
              <label className="erp-label" htmlFor="tax">
                {t("auth.taxId")}
              </label>
              <input
                id="tax"
                className="erp-input"
                value={companyTaxId}
                onChange={(e) => setCompanyTaxId(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="erp-label" htmlFor="first">
                  {t("auth.firstName")}
                </label>
                <input
                  id="first"
                  className="erp-input"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="erp-label" htmlFor="last">
                  {t("auth.lastName")}
                </label>
                <input
                  id="last"
                  className="erp-input"
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="erp-label" htmlFor="email">
                {t("auth.adminEmail")}
              </label>
              <input
                id="email"
                type="email"
                className="erp-input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="erp-label" htmlFor="pw">
                {t("auth.password")}
              </label>
              <PasswordInput
                id="pw"
                value={adminPassword}
                onChange={setAdminPassword}
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" disabled={loading} className="erp-btn-primary w-full">
              {t("auth.createAccount")}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-zinc-600">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            {t("auth.login")}
          </Link>
        </p>
      </AuthPublicShell>
    </>
  );
}
