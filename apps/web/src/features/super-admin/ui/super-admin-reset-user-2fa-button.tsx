"use client";

import { useCallback, useState } from "react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type Props = {
  userId: string;
  userName: string;
  kind: "platform" | "tenant";
  tenantId?: string;
  totpEnabled: boolean;
  onSuccess?: () => void;
  className?: string;
};

export function SuperAdminResetUser2faButton({
  userId,
  userName,
  kind,
  tenantId,
  totpEnabled,
  onSuccess,
  className = "sa-btn-outline text-xs",
}: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleReset = useCallback(async () => {
    const msg = totpEnabled
      ? t("superAdmin.users.reset2faConfirmEnabled", { userName })
      : t("superAdmin.users.reset2faConfirmDisabled", { userName });
    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      const path =
        kind === "platform"
          ? `/api/super-admin/platform-users/${userId}/reset-2fa`
          : `/api/super-admin/tenant-users/${userId}/reset-2fa`;
      const res = await fetch(buildApiUrl(path), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "tenant" ? { tenantId } : {}),
      });
      const data = (await res.json()) as { error?: string; wasEnabled?: boolean };
      if (!res.ok) {
        toast.error(data.error ?? t("superAdmin.users.reset2faFailed"));
        return;
      }
      toast.success(
        data.wasEnabled
          ? t("superAdmin.users.reset2faSuccessEnabled")
          : t("superAdmin.users.reset2faSuccessDisabled"),
      );
      onSuccess?.();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [userId, userName, kind, tenantId, totpEnabled, t, toast, onSuccess]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleReset()}
      disabled={loading}
      title={t("superAdmin.users.reset2faTitle")}
    >
      {loading ? t("superAdmin.common.resetting") : t("superAdmin.users.reset2fa")}
    </button>
  );
}
