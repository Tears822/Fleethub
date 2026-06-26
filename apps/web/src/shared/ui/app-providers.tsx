"use client";

import type { ReactNode } from "react";
import { DocumentLangSync } from "@/shared/i18n/document-lang-sync";
import { I18nProvider } from "@/shared/i18n/i18n-provider";
import { ToastProvider } from "./toast-provider";

export function AppProviders({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return (
    <I18nProvider locale={locale}>
      <DocumentLangSync />
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
