"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { getTimeGreetingKey } from "@/shared/lib/time-greeting";

const TICK_MS = 60_000;

function subscribe(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, TICK_MS);
  return () => window.clearInterval(id);
}

/** Navbar greeting for tenant Admin / Super Admin — time of day in Europe/Madrid. */
export function useTimeGreeting(): string {
  const { t } = useTranslations();
  const key = useSyncExternalStore(
    subscribe,
    () => getTimeGreetingKey(),
    () => "shell.greeting.fallback" as const,
  );
  return t(key);
}
