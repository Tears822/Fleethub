"use client";

import { useEffect } from "react";
import { useTranslations } from "./i18n-provider";

/** Sync `<html lang>` with tenant locale. */
export function DocumentLangSync() {
  const { locale } = useTranslations();
  useEffect(() => {
    document.documentElement.lang = locale === "ca" ? "ca" : "es";
  }, [locale]);
  return null;
}
