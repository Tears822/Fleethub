"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminForceSyncButton({
  tenantId,
  compact = false,
}: {
  tenantId: string;
  compact?: boolean;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function forceSync() {
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void forceSync()}
      className={
        compact
          ? "rounded border border-orange-300 px-2 py-0.5 text-[10px] font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-60"
          : "rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      }
      title={t("superAdmin.sync.forceSyncAll")}
    >
      {busy ? "…" : t("superAdmin.sync.forceSync")}
    </button>
  );
}
