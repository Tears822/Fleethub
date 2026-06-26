"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type AuthLoadingViewProps = {
  /** In-app path only (validated on server), e.g. `/dashboard` */
  next: string;
};

/**
 * Post-login handoff: hard-navigate to `next` so the dashboard always does a full document load
 * with the session cookie. Client `router.replace` + `router.refresh` can race with prefetched
 * RSC payloads from before login, which looks like “no redirect” or a bounce back to `/login`.
 */
export function AuthLoadingView({ next }: AuthLoadingViewProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;

    toast.success(t("auth.sessionStartedToast"));
    window.location.assign(next);
    // Intentionally run once on mount; `next` comes from server-validated URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable post-login handoff
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
          <BrandLogo size={48} className="h-full w-full object-contain" priority />
        </div>
        <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/25">
          <Loader2 className="h-7 w-7 animate-spin text-orange-500" aria-hidden />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-zinc-900">{t("auth.sessionReadyTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t("auth.sessionReadyBody")}</p>
      </div>
    </div>
  );
}
