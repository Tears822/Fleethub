"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiErrorMessage,
  parseApiErrorResponse,
} from "@/features/super-admin/lib/parse-api-error";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export function SuperAdminDeleteUserButton({
  userId,
  userName,
  kind,
  tenantId,
}: {
  userId: string;
  userName: string;
  kind: "platform" | "tenant";
  tenantId?: string;
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(t("superAdmin.users.deleteConfirm", { userName }))) {
      return;
    }

    setLoading(true);
    try {
      const url =
        kind === "platform"
          ? buildApiUrl(`/api/super-admin/platform-users/${userId}/delete`)
          : buildApiUrl(`/api/super-admin/tenant-users/${userId}/delete`);

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "tenant" ? { tenantId: tenantId ?? "" } : {}),
      });
      const data = await parseApiErrorResponse(res);
      if (!res.ok) {
        toast.error(
          apiErrorMessage(
            res,
            data,
            t("superAdmin.users.deleteFailed"),
            t("superAdmin.common.apiRouteNotFound"),
          ),
        );
        return;
      }
      toast.success(t("superAdmin.users.deleteSuccess"));
      router.refresh();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [kind, router, t, tenantId, toast, userId, userName]);

  return (
    <button
      type="button"
      className="sa-btn-delete"
      onClick={() => void handleDelete()}
      disabled={loading}
    >
      {loading ? t("superAdmin.common.deleting") : t("common.delete")}
    </button>
  );
}
