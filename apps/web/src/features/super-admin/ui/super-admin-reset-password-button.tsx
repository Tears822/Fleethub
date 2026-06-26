"use client";

import { useCallback, useState } from "react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type Props = {
  userId: string;
  userName: string;
  email: string;
  kind: "platform" | "tenant";
  tenantId?: string;
  className?: string;
};

export function SuperAdminResetPasswordButton({
  userId,
  userName,
  email,
  kind,
  tenantId,
  className = "sa-btn-outline text-xs",
}: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleReset = useCallback(async () => {
    const custom = window.prompt(
      t("superAdmin.users.resetPasswordPrompt", { userName, email }),
      "",
    );
    if (custom === null) return;

    const trimmed = custom.trim();
    if (trimmed.length > 0 && trimmed.length < 8) {
      toast.error(t("superAdmin.common.passwordMin8"));
      return;
    }

    if (
      !window.confirm(
        trimmed
          ? t("superAdmin.users.resetPasswordConfirmCustom", { userName })
          : t("superAdmin.users.resetPasswordConfirmGenerate", { userName }),
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const path =
        kind === "platform"
          ? `/api/super-admin/platform-users/${userId}/reset-password`
          : `/api/super-admin/tenant-users/${userId}/reset-password`;
      const res = await fetch(buildApiUrl(path), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "tenant"
            ? { tenantId, ...(trimmed ? { password: trimmed } : {}) }
            : trimmed
              ? { password: trimmed }
              : {},
        ),
      });
      const data = (await res.json()) as { error?: string; password?: string; email?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("superAdmin.users.resetPasswordFailed"));
        return;
      }
      const pwd = data.password ?? trimmed;
      if (pwd) {
        window.alert(
          t("superAdmin.users.resetPasswordAlert", {
            email: data.email ?? email,
            password: pwd,
          }),
        );
      }
      toast.success(t("superAdmin.users.resetPasswordSuccess"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [email, kind, t, tenantId, toast, userId, userName]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleReset()}
      disabled={loading}
      title={t("superAdmin.users.resetPasswordTitle")}
    >
      {loading ? t("superAdmin.common.resetting") : t("superAdmin.users.resetPassword")}
    </button>
  );
}
