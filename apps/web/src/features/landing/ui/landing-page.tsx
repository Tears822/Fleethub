"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  Code2,
  CreditCard,
  Globe,
  Headphones,
  LayoutDashboard,
  LineChart,
  RefreshCw,
  Shield,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LANDING_IMAGES } from "../landing-images";
import { LandingHeader } from "./landing-header";

const STAT_ITEMS = [
  { value: "+25", labelKey: "landing.stats.activeFleets" },
  { value: "+400", labelKey: "landing.stats.drivers" },
  { value: "99,5%", labelKey: "landing.stats.availability" },
  { value: "24h", labelKey: "landing.stats.setup" },
] as const;

const FEATURE_ITEMS = [
  { key: "dashboard", icon: BarChart3 },
  { key: "sync", icon: RefreshCw },
  { key: "settlement", icon: LayoutDashboard },
  { key: "drivers", icon: Users },
  { key: "analytics", icon: LineChart },
  { key: "alerts", icon: Bell },
  { key: "multiCompany", icon: Building2 },
  { key: "api", icon: Code2 },
] as const;

const STEP_ITEMS = [
  { n: "1", key: "register" },
  { n: "2", key: "joinAccount" },
  { n: "3", key: "addDrivers" },
  { n: "4", key: "operate" },
] as const;

const PLATFORMS = [
  { name: "Uber", active: true, logo: "/images/brand/uber.webp" },
  { name: "FreeNow", active: true, logo: "/images/brand/freenow.webp" },
  { name: "Bolt", active: false, logo: "/images/brand/bolt.webp" },
  { name: "Cabify", active: false, logo: "/images/brand/cabify.svg" },
] as const;

const SECURITY_BULLET_KEYS = ["multiTenant", "audit", "https"] as const;

const COVERAGE_IMAGE_KEYS = ["operations", "fleet", "highway"] as const;

const PRICING_PLANS = [
  {
    key: "starter",
    highlight: false,
    bullets: ["maxDrivers", "platforms", "dashboard", "settlements", "support"] as const,
  },
  {
    key: "pro",
    highlight: true,
    bullets: [
      "unlimitedDrivers",
      "allPlatforms",
      "api",
      "whatsapp",
      "multiCompany",
      "sepa",
      "prioritySupport",
    ] as const,
  },
  {
    key: "enterprise",
    highlight: false,
    bullets: [
      "negotiatedPrice",
      "assistedOnboarding",
      "assistedMigration",
      "customIntegrations",
      "accountManager",
    ] as const,
  },
] as const;

const TESTIMONIAL_ITEMS = [
  { key: "jose", initials: "JM" },
  { key: "sara", initials: "SR" },
  { key: "andreu", initials: "AC" },
] as const;

const FAQ_ITEMS = [
  "ownAccount",
  "setupTime",
  "boltCabify",
  "multiCompany",
  "dataSecurity",
  "erpIntegration",
] as const;

export function LandingPage() {
  const { t } = useTranslations();

  return (
    <div className="relative min-h-screen bg-zinc-50 text-zinc-600">
      <LandingHeader />

      {/* Hero */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-12 lg:py-28 xl:px-16">
          <div className="space-y-6 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <p className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700 sm:text-[11px]">
                <span className="inline-flex items-center gap-1 text-orange-700">
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  {t("landing.hero.badge.efficiency")}
                </span>
                <span className="text-zinc-300">·</span>
                <span>{t("landing.hero.badge.connectivity")}</span>
                <span className="text-zinc-300">·</span>
                <span>{t("landing.hero.badge.transparency")}</span>
                <span className="text-zinc-300">·</span>
                <span>{t("landing.hero.badge.confidence")}</span>
              </p>
            </div>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-zinc-900 md:text-5xl lg:text-[3.25rem]">
              {t("landing.hero.title")}{" "}
              <span className="text-orange-600">{t("landing.hero.titleHighlight")}</span>{" "}
              {t("landing.hero.titleSuffix")}
            </h1>
            <p className="mx-auto max-w-none text-base leading-relaxed text-zinc-600 md:text-lg lg:mx-0 lg:max-w-2xl">
              {t("landing.hero.subtitle")}
            </p>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-vision-xl bg-orange-500 px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-vision-md transition hover:brightness-110"
              >
                {t("landing.hero.ctaPrimary")}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
              <a
                href="#funcionalidades"
                className="vui-btn-outline inline-flex !w-auto items-center gap-2 px-8 py-3.5 text-sm font-semibold"
              >
                {t("landing.hero.ctaSecondary")}
              </a>
            </div>
            <p className="text-center text-xs text-zinc-600/85 lg:text-left">{t("landing.hero.note")}</p>
            <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm lg:justify-start lg:gap-10">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600/80">
                {t("landing.hero.connectedWith")}{" "}
                <span className="font-semibold text-zinc-800">Uber</span> ·{" "}
                <span className="font-semibold text-zinc-800">FreeNow</span> · Bolt · Cabify
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="relative overflow-hidden rounded-vision-xl border border-white/[0.1] shadow-vision-xxl">
              <Image
                src={LANDING_IMAGES.hero}
                alt={t("landing.hero.imageAlt")}
                width={900}
                height={620}
                className="h-auto w-full object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-gradient-to-t from-black/85 via-black/65 to-black/40 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <Truck className="h-8 w-8 shrink-0 text-orange-400" aria-hidden />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-white">
                      {t("landing.hero.panelTitle")}
                    </p>
                    <p className="text-[11px] leading-snug text-zinc-100 sm:text-xs">
                      {t("landing.hero.panelSubtitle")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-zinc-200 py-12">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-8 px-4 sm:px-8 md:grid-cols-4 lg:px-12 xl:px-16">
          {STAT_ITEMS.map((s) => (
            <div key={s.labelKey} className="text-center">
              <p className="text-2xl font-bold text-zinc-900 md:text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-zinc-600 md:text-sm">{t(s.labelKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="scroll-mt-24 border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 xl:px-16">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            {t("landing.features.sectionLabel")}
          </p>
          <h2 className="mt-2 text-center text-3xl font-bold text-zinc-900 md:text-4xl">
            {t("landing.features.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-zinc-600 md:text-base">
            {t("landing.features.subtitle")}
          </p>
          <div className="mx-auto mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_ITEMS.map((c) => (
              <div
                key={c.key}
                className="flex flex-col items-center rounded-vision-xl border border-zinc-200 bg-white p-5 text-center shadow-sm"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600">
                  <c.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 w-full text-base font-semibold leading-snug text-zinc-900">
                  {t(`landing.features.items.${c.key}.title`)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">
                  {t(`landing.features.items.${c.key}.desc`)}
                </p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                  {t(`landing.features.items.${c.key}.tag`)}
                </p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-xs text-zinc-600">
            <span className="inline-flex items-center justify-center gap-2">
              <CreditCard className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
              <strong className="text-zinc-900">{t("landing.features.sepaStrong")}</strong>{" "}
              {t("landing.features.sepaNote")}
            </span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="scroll-mt-24 border-b border-zinc-200 py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 sm:px-8 md:grid-cols-2 md:items-center lg:px-12 xl:px-16">
          <div className="relative aspect-[4/3] overflow-hidden rounded-vision-xl border border-white/10 shadow-vision-xxl">
            <Image
              src={LANDING_IMAGES.mobility}
              alt={t("landing.steps.imageAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 45vw"
            />
          </div>
          <div className="space-y-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
              {t("landing.steps.sectionLabel")}
            </p>
            <h2 className="text-2xl font-bold text-zinc-900 md:text-3xl">{t("landing.steps.title")}</h2>
            <ol className="space-y-5">
              {STEP_ITEMS.map((s) => (
                <li key={s.key} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/25 text-sm font-bold text-orange-600">
                    {s.n}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {t(`landing.steps.items.${s.key}.title`)}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      {t(`landing.steps.items.${s.key}.desc`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section id="plataformas" className="scroll-mt-24 border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 xl:px-16">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            {t("landing.platforms.sectionLabel")}
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold text-zinc-900 md:text-3xl">
            {t("landing.platforms.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-zinc-600">
            {t("landing.platforms.subtitle")}
          </p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className={`rounded-vision-xl border p-5 text-center shadow-vision-md backdrop-blur-xl ${
                  p.active ? "border-vision-brand/40 bg-orange-500/10" : "border-zinc-200 bg-white"
                }`}
              >
                <div className="relative mx-auto flex h-12 w-[7.5rem] items-center justify-center md:h-14 md:w-[8.5rem]">
                  <Image
                    src={p.logo}
                    alt=""
                    width={136}
                    height={56}
                    className={`max-h-12 w-auto object-contain md:max-h-14 ${p.active ? "" : "opacity-70 grayscale"}`}
                    aria-hidden
                  />
                </div>
                <p className="mt-3 text-lg font-bold text-zinc-900">{p.name}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {p.active ? t("landing.platforms.statusActive") : t("landing.platforms.statusComingSoon")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Split: trust / security */}
      <section className="border-b border-zinc-200 py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 sm:px-8 md:grid-cols-2 md:items-center lg:px-12 xl:px-16">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900 md:text-3xl">{t("landing.security.title")}</h2>
            <p className="text-sm leading-relaxed text-zinc-600 md:text-base">{t("landing.security.description")}</p>
            <ul className="space-y-3 text-sm text-zinc-600">
              {SECURITY_BULLET_KEYS.map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  {t(`landing.security.bullets.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-vision-xl border border-white/10 shadow-vision-xxl">
            <Image
              src={LANDING_IMAGES.analytics}
              alt={t("landing.security.imageAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 45vw"
            />
          </div>
        </div>
      </section>

      {/* Image grid */}
      <section className="border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 xl:px-16">
          <h2 className="text-center text-2xl font-bold text-zinc-900 md:text-3xl">{t("landing.coverage.title")}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-zinc-600">{t("landing.coverage.subtitle")}</p>
          <div className="mx-auto mt-10 grid w-full max-w-5xl gap-4 sm:grid-cols-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-vision-xl border border-white/10 shadow-vision-xxl">
              <Image
                src={LANDING_IMAGES.warehouse}
                alt={t("landing.coverage.imageAlts.operations")}
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-vision-xl border border-white/10 shadow-vision-xxl">
              <Image
                src={LANDING_IMAGES.fleetNight}
                alt={t("landing.coverage.imageAlts.fleet")}
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-vision-xl border border-white/10 shadow-vision-xxl">
              <Image
                src={LANDING_IMAGES.highway}
                alt={t("landing.coverage.imageAlts.highway")}
                fill
                className="object-cover"
                sizes="33vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precios" className="scroll-mt-24 border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 xl:px-16">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            {t("landing.pricing.sectionLabel")}
          </p>
          <h2 className="mt-2 text-center text-3xl font-bold text-zinc-900 md:text-4xl">
            {t("landing.pricing.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-zinc-600 md:text-base">
            {t("landing.pricing.subtitle")}
          </p>
          <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-vision-xl border p-6 shadow-vision-md backdrop-blur-xl md:p-8 ${
                  plan.highlight
                    ? "border-vision-brand/50 bg-orange-500/10 ring-1 ring-vision-brand/30"
                    : "border-zinc-200 bg-white"
                }`}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("landing.pricing.popularBadge")}
                  </span>
                ) : null}
                <p className="text-sm font-bold uppercase tracking-wide text-zinc-600">
                  {t(`landing.pricing.plans.${plan.key}.name`)}
                </p>
                <p className="mt-3 text-3xl font-bold text-zinc-900 md:text-4xl">
                  {t(`landing.pricing.plans.${plan.key}.price`)}
                </p>
                <p className="mt-1 text-xs text-zinc-600">{t(`landing.pricing.plans.${plan.key}.unit`)}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-zinc-600">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                      {t(`landing.pricing.plans.${plan.key}.bullets.${bullet}`)}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-vision-xl py-3 text-center text-sm font-bold uppercase tracking-wide transition ${
                    plan.highlight
                      ? "bg-orange-500 text-white shadow-vision-md hover:brightness-110"
                      : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  {plan.key === "enterprise" ? t("landing.pricing.contact") : t("landing.pricing.startFree")}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 xl:px-16">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            {t("landing.testimonials.sectionLabel")}
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold text-zinc-900 md:text-3xl">
            {t("landing.testimonials.title")}
          </h2>
          <div className="mx-auto mt-10 grid gap-6 md:grid-cols-3">
            {TESTIMONIAL_ITEMS.map((item) => (
              <blockquote
                key={item.key}
                className="rounded-vision-xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm leading-relaxed text-zinc-600">
                  &ldquo;{t(`landing.testimonials.items.${item.key}.quote`)}&rdquo;
                </p>
                <footer className="mt-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/15 text-sm font-bold text-orange-600">
                    {item.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {t(`landing.testimonials.items.${item.key}.name`)}
                    </p>
                    <p className="text-[11px] text-zinc-600">
                      {t(`landing.testimonials.items.${item.key}.role`)}
                    </p>
                  </div>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-b border-zinc-200 py-20">
        <div className="mx-auto w-full max-w-xl px-4 sm:max-w-2xl sm:px-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            {t("landing.faq.sectionLabel")}
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold text-zinc-900">{t("landing.faq.title")}</h2>
          <div className="mt-10 space-y-3">
            {FAQ_ITEMS.map((key) => (
              <details
                key={key}
                className="group rounded-vision-xl border border-zinc-200 bg-white shadow-sm open:shadow-md"
              >
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {t(`landing.faq.items.${key}.q`)}
                    <span className="text-zinc-600 transition group-open:rotate-180">▼</span>
                  </span>
                </summary>
                <div className="border-t border-zinc-100 px-5 pb-4 pt-2 text-sm leading-relaxed text-zinc-600">
                  {t(`landing.faq.items.${key}.a`)}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-zinc-200 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-4xl rounded-vision-xl border border-zinc-200 bg-white px-8 py-12 text-center shadow-sm">
          <Truck className="mx-auto h-10 w-10 text-orange-600" aria-hidden />
          <h2 className="mt-4 text-2xl font-bold text-zinc-900 md:text-3xl">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">{t("landing.cta.subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 rounded-vision-xl bg-orange-500 px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-vision-md transition hover:brightness-110"
            >
              {t("landing.cta.ctaPrimary")}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <a
              href="https://fleethub.velcos.es/"
              target="_blank"
              rel="noreferrer"
              className="vui-btn-outline inline-flex !w-auto items-center gap-2 px-8 py-3.5 text-sm font-semibold"
            >
              <Globe className="h-4 w-4 shrink-0" aria-hidden />
              {t("landing.cta.ctaSecondary")}
            </a>
          </div>
        </div>
      </section>

      {/* Security strip (compact) */}
      <section className="border-b border-zinc-200 py-12">
        <div className="mx-auto max-w-5xl rounded-vision-xl border border-zinc-200 bg-white px-6 py-8 shadow-sm md:px-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between md:gap-10">
            <div className="flex items-center gap-4 text-center md:text-left">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-600">
                <Shield className="h-7 w-7" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 md:text-xl">{t("landing.securityStrip.title")}</h2>
                <p className="mt-1 max-w-xl text-sm text-zinc-600">{t("landing.securityStrip.description")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-zinc-600">
              <Headphones className="h-5 w-5 text-orange-600" aria-hidden />
              <span className="text-sm">{t("landing.securityStrip.support")}</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-zinc-100 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 md:flex-row md:justify-between">
          <div>
            <p className="flex items-center gap-2.5 text-lg font-bold text-zinc-900">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
                <BrandLogo size={36} className="h-full w-full object-contain" />
              </span>
              {t("landing.footer.brand")}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-600">
              {t("landing.footer.description")} {t("landing.footer.imagesLabel")}{" "}
              <a
                href="https://unsplash.com"
                className="text-orange-700 underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {t("landing.footer.unsplash")}
              </a>
              .
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-zinc-900">{t("landing.footer.product")}</p>
              <ul className="mt-3 space-y-2 text-zinc-600">
                <li>
                  <a href="#funcionalidades" className="hover:text-zinc-900">
                    {t("landing.footer.features")}
                  </a>
                </li>
                <li>
                  <a href="#plataformas" className="hover:text-zinc-900">
                    {t("landing.footer.platforms")}
                  </a>
                </li>
                <li>
                  <a href="#precios" className="hover:text-zinc-900">
                    {t("landing.footer.pricing")}
                  </a>
                </li>
                <li>
                  <span className="text-zinc-600/70">{t("landing.footer.apiDocs")}</span>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-zinc-900">{t("landing.footer.company")}</p>
              <ul className="mt-3 space-y-2 text-zinc-600">
                <li>
                  <a href="https://fleethub.velcos.es/" className="hover:text-zinc-900" target="_blank" rel="noreferrer">
                    {t("landing.footer.commercialSite")}
                  </a>
                </li>
                <li>
                  <span className="text-zinc-600/70">{t("landing.footer.contact")}</span>
                </li>
                <li>
                  <span className="text-zinc-600/70">{t("landing.footer.support")}</span>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-zinc-900">{t("landing.footer.access")}</p>
              <ul className="mt-3 space-y-2 text-zinc-600">
                <li>
                  <Link href="/login" className="hover:text-zinc-900">
                    {t("landing.footer.loginTrial")}
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="hover:text-zinc-900">
                    {t("landing.footer.dashboard")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 text-center text-[11px] text-zinc-600/60">
          {t("landing.footer.copyright", { year: new Date().getFullYear() })}{" "}
          <a
            href="https://fleethub.velcos.es/"
            className="text-orange-700 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            fleethub.velcos.es
          </a>
        </p>
      </footer>
    </div>
  );
}
