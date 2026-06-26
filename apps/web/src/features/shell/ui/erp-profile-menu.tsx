"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type ErpProfileMenuProps = {
  displayName: string;
  email: string;
  avatarLetter: string;
  onLogout: () => void;
  loggingOut?: boolean;
};

export function ErpProfileMenu({
  displayName,
  email,
  avatarLetter,
  onLogout,
  loggingOut = false,
}: ErpProfileMenuProps) {
  const { t } = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("click", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white ring-2 ring-transparent transition hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        aria-label={t("shell.profileMenu")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={email}
      >
        {avatarLetter}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          <p className="border-b border-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900">
            {displayName}
          </p>
          <Link
            href="/ajustes"
            role="menuitem"
            onClick={close}
            className="block px-4 py-2.5 text-sm text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            {t("shell.settings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            onClick={() => {
              close();
              onLogout();
            }}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {t("shell.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
