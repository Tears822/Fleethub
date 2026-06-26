"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import type { FleetLocale } from "@fleethub/i18n";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

const LOCALE_OPTIONS: FleetLocale[] = ["es", "ca"];

type LocaleSwitcherProps = {
  /** Persist to user profile (tenant) or guest cookie (public / super-admin). */
  mode: "account" | "guest";
  className?: string;
};

export function LocaleSwitcher({ mode, className = "" }: LocaleSwitcherProps) {
  const { locale, t } = useTranslations();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function onChange(next: FleetLocale) {
    if (next === locale || saving) return;
    setSaving(true);
    try {
      const endpoint = mode === "account" ? "/api/auth/locale" : "/api/auth/guest-locale";
      const res = await fetch(buildApiUrl(endpoint), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("common.error"));
        return;
      }
      window.location.reload();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-sm ${className}`.trim()}
    >
      <Languages className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <span className="sr-only">{t("account.language")}</span>
      <select
        value={locale}
        disabled={saving}
        onChange={(e) => void onChange(e.target.value as FleetLocale)}
        aria-label={t("account.language")}
        className="max-w-[6.5rem] cursor-pointer border-0 bg-transparent py-0 pl-0 pr-5 text-xs font-semibold text-zinc-800 outline-none focus:ring-0 disabled:opacity-50"
      >
        {LOCALE_OPTIONS.map((code) => (
          <option key={code} value={code}>
            {t(code === "es" ? "account.localeEs" : "account.localeCa")}
          </option>
        ))}
      </select>
    </label>
  );
}
