"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export function SuperAdminImpersonateButton({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleImpersonate = useCallback(async () => {
    if (!window.confirm(t("superAdmin.tenants.impersonateConfirm", { tenantName }))) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/super-admin/impersonate/${tenantId}`), {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("superAdmin.tenants.impersonateFailed"));
        return;
      }
      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenantName, router, t, toast]);

  return (
    <button
      type="button"
      onClick={() => void handleImpersonate()}
      disabled={loading}
      className="sa-btn-outline inline-flex items-center gap-1.5 text-xs"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      {loading ? t("superAdmin.common.opening") : t("superAdmin.tenants.impersonate")}
    </button>
  );
}
