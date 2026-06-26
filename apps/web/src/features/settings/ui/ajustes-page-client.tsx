"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppSession } from "@/domain/session.types";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { LoadingOverlay } from "@/shared/ui/loading-overlay";
import { useToast } from "@/shared/ui/toast-provider";
import type { FleetLocale } from "@fleethub/i18n";
import { AjustesCuentaView } from "./ajustes-cuenta-view";
import { TotpSetupPanel } from "./totp-setup-panel";

export function AjustesPageClient({
  session,
  locale,
  profile,
}: {
  session: AppSession;
  locale: FleetLocale;
  profile: { firstName: string; lastName: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <>
      <LoadingOverlay
        open={loggingOut}
        message={t("shell.loggingOut")}
        label={t("shell.loggingOut")}
      />
      <AjustesCuentaView
        email={session.email}
        initialFirstName={profile.firstName}
        initialLastName={profile.lastName}
        role={session.role}
        locale={locale}
        onLogout={() => void logout()}
        loggingOut={loggingOut}
        onProfileSaved={() => router.refresh()}
      />
      {!session.impersonating ? <TotpSetupPanel /> : null}
    </>
  );
}
