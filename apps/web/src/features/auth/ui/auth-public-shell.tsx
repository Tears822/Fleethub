"use client";

import Link from "next/link";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

type AuthPublicShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  backHref?: string;
};

export function AuthPublicShell({
  title,
  subtitle,
  children,
  backHref = "/login",
}: AuthPublicShellProps) {
  const { t } = useTranslations();

  return (
    <div className="relative min-h-screen bg-zinc-100">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LocaleSwitcher mode="guest" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <Link
          href={backHref}
          className="mb-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 transition hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("auth.backToAccess")}
        </Link>
        <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
            <BrandLogo size={32} className="h-full w-full object-contain" />
          </span>
          FleetHub
        </p>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
