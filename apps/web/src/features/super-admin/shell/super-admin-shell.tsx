"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import type { AppSession } from "@/domain/session.types";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { useToast } from "@/shared/ui/toast-provider";
import { ErpAppNavbar } from "@/features/shell/ui/erp-app-navbar";
import { ShellRouteLoadingIndicator } from "@/features/shell/ui/shell-route-loading-indicator";
import { useShellRouteTransition } from "@/features/shell/ui/use-shell-route-transition";
import { getSuperAdminNavTitleKey, superAdminNavGroups } from "./super-admin.nav";

const SIDEBAR_COLLAPSED_KEY = "fleethub-super-admin-sidebar-collapsed";

export function SuperAdminShell({
  session,
  children,
}: {
  session: AppSession;
  children: React.ReactNode;
}) {
  const { t } = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { pending: routePending, beginRouteTransition } = useShellRouteTransition();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function logout() {
    setLoggingOut(true);
    try {
      const res = await fetch(buildApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        toast.error(t("shell.logoutError"));
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      toast.error(t("shell.serverError"));
    } finally {
      setLoggingOut(false);
    }
  }

  const collapsed = sidebarCollapsed;

  return (
    <>
      <LoadingOverlay
        open={loggingOut}
        message={t("shell.loggingOut")}
        label={t("shell.loggingOut")}
      />
      <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-zinc-100">
        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            aria-label={t("shell.closeMenu")}
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <aside
          id="super-admin-sidebar"
          className={[
            "z-40 flex w-[268px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-5 text-white",
            "transition-[width,padding] duration-200 ease-out",
            collapsed ? "md:w-[4.75rem] md:px-2 md:py-4" : "md:w-[268px]",
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-2xl",
            mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
            "md:relative md:translate-x-0",
          ].join(" ")}
        >
          <div
            className={`flex items-center gap-3 border-b border-white/10 pb-4 ${collapsed ? "md:flex-col md:gap-2" : ""}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 p-1.5">
              <BrandLogo size={28} className="h-full w-full object-contain" />
            </span>
            <div className={`min-w-0 flex-1 ${collapsed ? "max-md:block hidden" : ""}`}>
              <p className="text-sm font-bold">FleetHub</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-400">
                {t("superAdmin.brand")}
              </p>
            </div>
            <button
              type="button"
              className={`rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white ${collapsed ? "" : "ml-auto max-md:ml-0"}`}
              onClick={() => {
                if (window.matchMedia("(max-width: 767px)").matches) {
                  setMobileNavOpen(false);
                } else {
                  toggleSidebarCollapsed();
                }
              }}
              aria-label={collapsed ? t("shell.expandMenu") : t("shell.collapseMenu")}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 max-md:hidden" />
              ) : (
                <>
                  <PanelLeftClose className="hidden h-4 w-4 md:block" />
                  <X className="h-5 w-5 md:hidden" />
                </>
              )}
            </button>
          </div>

          <nav className="vision-scrollbar mt-4 flex-1 overflow-y-auto">
            {superAdminNavGroups.map((group) => (
              <div key={group.id} className={collapsed ? "mb-3 md:mb-4" : "mb-5"}>
                <p
                  className={`px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 ${collapsed ? "md:hidden" : ""}`}
                >
                  {t(group.sectionLabelKey)}
                </p>
                {collapsed ? (
                  <div className="mx-auto mb-2 hidden h-px w-8 bg-white/10 md:block" aria-hidden />
                ) : null}
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== "/super-admin" && pathname.startsWith(`${item.href}/`)) ||
                      (item.href === "/super-admin" && pathname === "/super-admin");
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={(e) => {
                            if (
                              e.metaKey ||
                              e.ctrlKey ||
                              e.shiftKey ||
                              e.altKey ||
                              e.button !== 0
                            ) {
                              return;
                            }
                            beginRouteTransition(item.href);
                          }}
                          title={collapsed ? t(item.labelKey) : undefined}
                          className={`flex items-center rounded-lg py-2.5 text-xs font-semibold uppercase tracking-wide transition ${
                            collapsed
                              ? "gap-3 px-3 md:justify-center md:gap-0 md:px-2"
                              : "gap-3 px-3"
                          } ${
                            active
                              ? "border-l-[3px] border-orange-500 bg-orange-950/50 text-white"
                              : "border-l-[3px] border-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                          } ${item.accent ? "text-orange-300" : ""}`}
                        >
                          <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
                          <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>
                            {t(item.labelKey)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => void logout()}
            title={collapsed ? t("shell.logout") : undefined}
            className={`mt-4 flex items-center rounded-lg py-2.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white ${
              collapsed ? "gap-3 px-3 md:justify-center md:gap-0 md:px-2" : "gap-3 px-3"
            }`}
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className={collapsed ? "md:hidden" : ""}>{t("shell.logout")}</span>
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50">
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:px-6 md:pb-6">
            <ErpAppNavbar
              session={session}
              headerTitle={t(getSuperAdminNavTitleKey(pathname))}
              mobileNavOpen={mobileNavOpen}
              onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
              sidebarCollapsed={collapsed}
              onToggleSidebar={toggleSidebarCollapsed}
              sidebarId="super-admin-sidebar"
              onLogout={() => void logout()}
              loggingOut={loggingOut}
              showCompanyScope={false}
              localeMode="guest"
            />
            <main className="vision-scrollbar relative min-h-0 flex-1 overflow-y-auto text-zinc-900">
              <ShellRouteLoadingIndicator pending={routePending && !loggingOut} />
              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
