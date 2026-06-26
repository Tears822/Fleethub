"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createTranslator,
  normalizeLocale,
  type FleetLocale,
  type Translator,
} from "@fleethub/i18n";

type I18nContextValue = {
  locale: FleetLocale;
  t: Translator;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale: rawLocale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const locale = normalizeLocale(rawLocale);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: createTranslator(locale),
    }),
    [locale],
  );

  return (
    <I18nContext.Provider value={value} key={locale}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslations must be used within I18nProvider");
  }
  return ctx;
}

/** Safe fallback when provider is absent (e.g. Storybook). */
export function useOptionalTranslations(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  const locale = normalizeLocale("es");
  return { locale, t: createTranslator(locale) };
}
