"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LogIn, Menu, Play, X } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

const navLinkKeys = [
  { href: "#funcionalidades", labelKey: "landing.nav.features" },
  { href: "#plataformas", labelKey: "landing.nav.platforms" },
  { href: "#precios", labelKey: "landing.nav.pricing" },
  { href: "#faq", labelKey: "landing.nav.faq" },
] as const;

/** Full inline navbar at this min-width (px) and above; below → hamburger (matches Tailwind `min-[1101px]:`). */
const NAV_DESKTOP_MIN_PX = 1101;

export function LandingHeader() {
  const { t } = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${NAV_DESKTOP_MIN_PX}px)`);
    const onChange = () => {
      if (mq.matches) {
        setMenuOpen(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 flex justify-center px-4 pt-5">
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm min-[1101px]:hidden"
          aria-label={t("landing.nav.closeMenu")}
          onClick={closeMenu}
        />
      ) : null}

      <nav
        className="relative z-50 flex w-full max-w-7xl flex-nowrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-4 shadow-md backdrop-blur-xl sm:max-w-[90rem] sm:gap-5 sm:px-8 sm:py-5 lg:max-w-[min(100%,96rem)] lg:gap-6 lg:px-10"
        aria-label={t("landing.nav.main")}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-zinc-900" onClick={closeMenu}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 p-1 ring-1 ring-zinc-200 min-[1101px]:h-11 min-[1101px]:w-11 min-[1101px]:p-1.5">
            <BrandLogo size={44} className="h-full w-full object-contain" priority />
          </span>
          <span className="text-lg font-bold tracking-tight min-[1101px]:text-xl">FleetHub</span>
        </Link>

        <div className="hidden min-w-0 flex-1 justify-center px-1 sm:px-2 min-[1101px]:flex">
          <div className="flex min-w-max flex-nowrap items-center justify-center gap-x-5 whitespace-nowrap text-sm font-medium text-zinc-600 sm:gap-x-7 min-[1101px]:text-base lg:gap-x-9">
            {navLinkKeys.map((l) => (
              <a key={l.href} href={l.href} className="shrink-0 transition hover:text-zinc-900">
                {t(l.labelKey)}
              </a>
            ))}
          </div>
        </div>

        <div className="hidden shrink-0 flex-nowrap items-center gap-2 sm:gap-2.5 min-[1101px]:flex">
          <LocaleSwitcher mode="guest" />
          <Link
            href="/login"
            className="vui-btn-outline inline-flex !w-auto shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide sm:px-5 sm:py-3 sm:text-sm"
          >
            <LogIn className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
            {t("landing.nav.login")}
          </Link>
          <Link
            href="/registro"
            title={t("landing.nav.trial")}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-vision-xl bg-vision-brand px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-vision-md transition hover:brightness-110 sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
          >
            <Play className="h-3.5 w-3.5 shrink-0 fill-current sm:h-4 sm:w-4" aria-hidden />
            {t("landing.nav.trial")}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 min-[1101px]:hidden">
          <LocaleSwitcher mode="guest" />
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 transition hover:bg-zinc-100"
            aria-expanded={menuOpen}
            aria-controls="landing-nav-menu"
            aria-label={menuOpen ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>

        <div
          id="landing-nav-menu"
          className={`absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 transition-[opacity,visibility] duration-200 min-[1101px]:hidden ${
            menuOpen ? "visible opacity-100" : "invisible pointer-events-none opacity-0"
          }`}
          aria-hidden={!menuOpen}
        >
          <div className="mx-auto max-h-[min(70vh,28rem)] overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#0a1028]/95 p-4 shadow-vision-xxl backdrop-blur-xl">
            <ul className="flex flex-col gap-0.5">
              {navLinkKeys.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="block rounded-xl px-4 py-3 text-base font-medium text-vision-muted transition hover:bg-white/[0.06] hover:text-white"
                    onClick={closeMenu}
                  >
                    {t(l.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <Link
                href="/login"
                className="vui-btn-outline mb-3 flex !w-full items-center justify-center gap-2 py-3 text-sm font-semibold uppercase tracking-wide"
                onClick={closeMenu}
              >
                <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                {t("landing.nav.login")}
              </Link>
              <Link
                href="/registro"
                className="flex w-full items-center justify-center gap-2 rounded-vision-xl bg-vision-brand py-3 text-sm font-bold uppercase tracking-wide text-white shadow-vision-md transition hover:brightness-110"
                onClick={closeMenu}
              >
                <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden />
                {t("landing.nav.trial")}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
