"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "@/shared/i18n/i18n-provider";

/** Light page chrome — white ERP prototype (compact). Company filter lives in top navbar. */
export function SuperAdminPageChrome({
  title,
  subtitle,
  backHref,
  badge,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslations();

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {badge}
          {backHref ? (
            <Link href={backHref} className="sa-btn-outline px-3 py-1.5">
              {t("common.back")}
            </Link>
          ) : null}
          {actions}
        </div>
      </header>

      {children}
    </section>
  );
}

export function SuperAdminCenteredForm({
  children,
  maxWidthClass = "max-w-5xl",
}: {
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="flex w-full justify-center py-2">
      <div className={`w-full ${maxWidthClass}`}>{children}</div>
    </div>
  );
}

export function SuperAdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

export function SuperAdminPanelHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {trailing}
    </div>
  );
}
