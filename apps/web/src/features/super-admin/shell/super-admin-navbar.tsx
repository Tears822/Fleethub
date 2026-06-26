"use client";

import { Menu, X } from "lucide-react";
import type { AppSession } from "@/domain/session.types";
import { useTimeGreeting } from "@/shared/ui/use-time-greeting";
import { getSuperAdminNavTitle } from "./super-admin.nav";

function greetingName(session: AppSession): string {
  if (session.name?.trim()) {
    return session.name.trim().split(/\s+/)[0] ?? session.email;
  }
  return session.email.split("@")[0] ?? "Admin";
}

export function SuperAdminNavbar({
  session,
  pathname,
  mobileNavOpen,
  onToggleMobileNav,
}: {
  session: AppSession;
  pathname: string;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}) {
  const title = getSuperAdminNavTitle(pathname);
  const firstName = greetingName(session);
  const greeting = useTimeGreeting();

  return (
    <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-1 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileNav}
          className="rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50 md:hidden"
          aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileNavOpen}
          aria-controls="super-admin-sidebar"
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 md:text-base">
          Super Admin — {title}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="hidden text-sm text-zinc-600 sm:inline">
          {greeting}, <span className="font-semibold text-zinc-900">{firstName}</span>
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white"
          title={session.email}
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
