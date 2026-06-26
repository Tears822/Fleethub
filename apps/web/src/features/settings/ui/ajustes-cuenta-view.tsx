"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";
import type { FleetLocale } from "@fleethub/i18n";

const LOCALE_OPTIONS = [
  { value: "es", labelKey: "account.localeEs" },
  { value: "ca", labelKey: "account.localeCa" },
] as const;

type AjustesCuentaViewProps = {
  email: string;
  initialFirstName: string;
  initialLastName: string;
  role: string;
  locale: FleetLocale;
  onLogout: () => void;
  loggingOut?: boolean;
  onProfileSaved?: () => void;
};

function roleLabel(role: string, t: (key: string) => string): string {
  if (role === "ADMIN_TENANT") return t("account.roles.admin");
  if (role === "GESTOR") return t("account.roles.gestor");
  if (role === "SOLO_LECTURA") return t("account.roles.readOnly");
  if (role === "SUPER_ADMIN") return t("account.roles.superAdmin");
  return role;
}

export function AjustesCuentaView({
  email,
  initialFirstName,
  initialLastName,
  role,
  locale: initialLocale,
  onLogout,
  loggingOut = false,
  onProfileSaved,
}: AjustesCuentaViewProps) {
  const { t } = useTranslations();
  const toast = useToast();

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);

  useEffect(() => {
    setFirstName(initialFirstName);
    setLastName(initialLastName);
  }, [initialFirstName, initialLastName]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [locale, setLocale] = useState<FleetLocale>(initialLocale);
  const [savingLocale, setSavingLocale] = useState(false);

  const displayName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    t("account.defaultUser");

  const handleSaveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/profile"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        firstName?: string | null;
        lastName?: string | null;
      };
      if (!res.ok) {
        toast.error(data.error ?? t("account.profileSaveError"));
        return;
      }
      if (data.firstName != null) setFirstName(data.firstName.trim());
      if (data.lastName != null) setLastName(data.lastName.trim());
      toast.success(t("account.profileSaved"));
      onProfileSaved?.();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSavingProfile(false);
    }
  }, [firstName, lastName, onProfileSaved, t, toast]);

  const handleUpdatePassword = useCallback(async () => {
    if (!password && !confirmPassword) {
      toast.info(t("account.passwordEmptyHint"));
      return;
    }
    if (!currentPassword) {
      toast.error(t("account.currentPasswordRequired"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("account.passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("account.passwordMismatch"));
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/change-password"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword: password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("account.passwordUpdateError"));
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      toast.success(t("account.passwordUpdated"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSavingPassword(false);
    }
  }, [confirmPassword, currentPassword, password, t, toast]);

  const handleSaveLocale = useCallback(async () => {
    setSavingLocale(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/locale"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("common.error"));
        return;
      }
      toast.success(t("account.languageSaved"));
      if (locale !== initialLocale) {
        window.location.reload();
      }
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSavingLocale(false);
    }
  }, [initialLocale, locale, t, toast]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">{t("account.title")}</h1>
        <p className="mt-0.5 text-sm text-zinc-600">{t("account.description")}</p>
      </div>

      <VuiPanel className="p-5 md:p-6">
        <h2 className="text-sm font-semibold text-zinc-900">{t("account.language")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t("account.languageHint")}</p>
        <label className="mt-4 block text-xs font-medium text-zinc-600">
          {t("account.language")}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as FleetLocale)}
            className="mt-1.5 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void handleSaveLocale()}
            disabled={savingLocale}
            className="erp-btn-primary px-5"
          >
            {savingLocale ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </VuiPanel>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <VuiPanel className="p-5 md:p-6">
          <h2 className="text-sm font-semibold text-zinc-900">{t("account.personalData")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-600">
              {t("account.firstName")}
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="erp-inline-input mt-1 w-full text-left"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              {t("account.lastName")}
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="erp-inline-input mt-1 w-full text-left"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600 sm:col-span-2">
              {t("account.emailLabel")}
              <input
                type="email"
                value={email}
                readOnly
                className="erp-inline-input mt-1 w-full cursor-not-allowed bg-zinc-50 text-left text-zinc-500"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                {t("account.emailReadonlyHint")}
              </span>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile}
              className="erp-btn-primary px-5"
            >
              {savingProfile ? t("common.saving") : t("account.saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => {
                setFirstName(initialFirstName);
                setLastName(initialLastName);
              }}
              className="erp-btn-outline px-5 normal-case"
            >
              {t("common.cancel")}
            </button>
          </div>
        </VuiPanel>

        <VuiPanel className="p-5 md:p-6">
          <h2 className="text-sm font-semibold text-zinc-900">{t("account.passwordSection")}</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-zinc-600">
              {t("account.currentPassword")}
              <div className="relative mt-1">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="erp-inline-input w-full pr-10 text-left"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700"
                  aria-label={
                    showCurrentPassword ? t("account.hidePassword") : t("account.showPassword")
                  }
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              {t("account.newPassword")}
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="erp-inline-input w-full pr-10 text-left"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700"
                  aria-label={showPassword ? t("account.hidePassword") : t("account.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              {t("account.confirmPassword")}
              <div className="relative mt-1">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="erp-inline-input w-full pr-10 text-left"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700"
                  aria-label={
                    showConfirmPassword ? t("account.hideConfirm") : t("account.showConfirm")
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <p className="text-[11px] text-zinc-500">{t("account.passwordHint")}</p>
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => void handleUpdatePassword()}
              disabled={savingPassword}
              className="erp-btn-primary px-5"
            >
              {savingPassword ? t("account.updating") : t("account.updatePassword")}
            </button>
          </div>
        </VuiPanel>
      </div>

      <VuiPanel className="p-5 md:p-6">
        <h2 className="text-sm font-semibold text-zinc-900">{t("account.activeSession")}</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
              {displayName?.charAt(0).toUpperCase() || "U"}
            </span>
            <div>
              <p className="font-medium text-zinc-900">{displayName}</p>
              <p className="text-xs text-zinc-500">{email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-bold uppercase text-orange-800">
              {roleLabel(role, t)}
            </span>
            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {t("shell.logout")}
            </button>
          </div>
        </div>
      </VuiPanel>
    </div>
  );
}
