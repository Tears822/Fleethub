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

export function SuperAdminDeleteTenantButton({
  tenantId,
  tenantName,
  redirectTo = "/super-admin/tenants",
}: {
  tenantId: string;
  tenantName: string;
  redirectTo?: string;
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(t("superAdmin.tenants.deleteConfirm", { tenantName }))) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/super-admin/tenants/${tenantId}/delete`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await parseApiErrorResponse(res);
      if (!res.ok) {
        toast.error(
          apiErrorMessage(
            res,
            data,
            t("superAdmin.tenants.deleteFailed"),
            t("superAdmin.common.apiRouteNotFound"),
          ),
        );
        return;
      }
      toast.success(t("superAdmin.tenants.deleteSuccess"));
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [redirectTo, router, t, tenantId, tenantName, toast]);

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
