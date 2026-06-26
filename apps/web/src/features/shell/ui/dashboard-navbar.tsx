"use client";

import Link from "next/link";
import { Bell, Menu, PanelLeft, PanelLeftClose, Search, Settings, X } from "lucide-react";
import type { AppSession } from "@/domain/session.types";
import { useOptionalTranslations } from "@/shared/i18n/i18n-provider";
import { getShellNavTitle } from "../shell.nav";

export function DashboardNavbar({
  session,
  pathname,
  mobileNavOpen,
  onToggleMobileNav,
  desktopSidebarCollapsed,
  onToggleDesktopSidebar,
}: {
  session: AppSession;
  pathname: string;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  desktopSidebarCollapsed: boolean;
  onToggleDesktopSidebar: () => void;
}) {
  const { t } = useOptionalTranslations();
  const title = getShellNavTitle(pathname, t);
  const showSettings = session.role === "ADMIN_TENANT";

  return (
    <header className="relative z-30 mb-6 shrink-0 overflow-visible rounded-vision-xl border border-white/[0.1] bg-white/[0.07] px-4 py-3 shadow-vision-xxl backdrop-blur-2xl md:sticky md:top-0 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-vision-body/30 text-vision-muted transition hover:border-white/15 hover:text-white md:hidden"
            aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
          >
            {mobileNavOpen ? (
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            ) : (
              <Menu className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-vision-body/30 text-vision-muted transition hover:border-white/15 hover:text-white md:flex"
            aria-label={desktopSidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral"}
            aria-expanded={!desktopSidebarCollapsed}
            aria-controls="app-sidebar"
          >
            {desktopSidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-vision-muted/90">
              Vista
            </p>
            <h2 className="truncate text-lg font-semibold uppercase leading-tight tracking-wide text-white md:text-xl">
              {title}
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 md:max-w-xl">
          <div className="relative hidden min-w-0 flex-1 md:block md:max-w-[220px] lg:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vision-muted/80"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Buscar…"
              readOnly
              tabIndex={-1}
              className="w-full cursor-default rounded-xl border border-white/[0.1] bg-vision-body/40 py-2 pl-10 pr-3 text-xs text-white placeholder:text-vision-muted/60 outline-none ring-0"
              aria-hidden
            />
          </div>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-vision-body/30 text-vision-muted transition hover:border-white/15 hover:text-white"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
          </button>

          {showSettings ? (
            <Link
              href="/configuracion"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-vision-body/30 text-vision-muted transition hover:border-white/15 hover:text-white"
              aria-label="Configuración"
            >
              <Settings className="h-4 w-4" strokeWidth={2} />
            </Link>
          ) : null}

          <span
            className="hidden max-w-[140px] truncate rounded-xl border border-white/[0.1] bg-vision-sidebar/80 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-white/90 sm:inline-block"
            title={session.slug}
          >
            {session.slug}
          </span>
        </div>
      </div>
    </header>
  );
}
