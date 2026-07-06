"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { AppSession } from "@/domain/session.types";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { useTimeGreeting } from "@/shared/ui/use-time-greeting";
import { ErpProfileMenu } from "./erp-profile-menu";
import { ShellCompanyScopeDropdown } from "./shell-company-scope-dropdown";

function greetingName(session: AppSession, fallback: string): string {
  if (session.name?.trim()) {
    return session.name.trim().split(/\s+/)[0] ?? session.email;
  }
  return session.email.split("@")[0] ?? fallback;
}

function displayName(session: AppSession, fallback: string): string {
  if (session.name?.trim()) return session.name.trim();
  const local = session.email.split("@")[0] ?? fallback;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** White top bar — tenant shell and Super Admin. */
export function ErpAppNavbar({
  session,
  headerTitle,
  mobileNavOpen,
  onToggleMobileNav,
  sidebarCollapsed = false,
  onToggleSidebar,
  sidebarId = "app-sidebar",
  onLogout,
  loggingOut = false,
  showCompanyScope = true,
  localeMode = "account",
}: {
  session: AppSession;
  headerTitle: string;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  sidebarId?: string;
  onLogout: () => void;
  loggingOut?: boolean;
  /** Tenant shell only — Super Admin manages tenants, not company scope. */
  showCompanyScope?: boolean;
  localeMode?: "account" | "guest";
}) {
  const { t } = useTranslations();
  const userFallback = t("shell.defaultUser");
  const firstName = greetingName(session, userFallback);
  const greeting = useTimeGreeting();
  const profileName = displayName(session, userFallback);

  return (
    <header className="relative z-30 mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-1 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileNav}
          className="rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50 md:hidden"
          aria-label={mobileNavOpen ? t("shell.closeMenu") : t("shell.openMenu")}
          aria-expanded={mobileNavOpen}
          aria-controls={sidebarId}
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50 md:inline-flex"
            aria-label={
              sidebarCollapsed ? t("shell.showSidebar") : t("shell.hideSidebar")
            }
            aria-expanded={!sidebarCollapsed}
            aria-controls={sidebarId}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        ) : null}
        <h2 className="truncate text-sm font-bold uppercase tracking-wide text-zinc-800 md:text-base">
          {headerTitle}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {showCompanyScope ? <ShellCompanyScopeDropdown /> : null}
        <LocaleSwitcher mode={localeMode} />
        <span className="hidden text-sm text-zinc-600 sm:inline">
          {greeting}, <span className="font-semibold text-zinc-900">{firstName}</span>
        </span>
        <ErpProfileMenu
          displayName={profileName}
          email={session.email}
          avatarLetter={firstName.charAt(0).toUpperCase()}
          onLogout={onLogout}
          loggingOut={loggingOut}
        />
      </div>
    </header>
  );
}
