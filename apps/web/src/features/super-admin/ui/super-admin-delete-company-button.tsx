"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type Props = {
  companyId: string;
  legalName: string;
  driverCount: number;
  redirectTo?: string;
};

export function SuperAdminDeleteCompanyButton({
  companyId,
  legalName,
  driverCount,
  redirectTo = "/super-admin/empresas",
}: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = useCallback(async () => {
    if (driverCount > 0) {
      toast.error(t("superAdmin.companies.deleteHasDrivers"));
      return;
    }

    if (!window.confirm(t("superAdmin.companies.deleteConfirm", { legalName }))) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/super-admin/companies/${companyId}/delete`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("superAdmin.companies.deleteFailed"));
        return;
      }
      toast.success(t("superAdmin.companies.deleteSuccess"));
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast.error(t("superAdmin.common.serverConnectionError"));
    } finally {
      setLoading(false);
    }
  }, [companyId, driverCount, legalName, redirectTo, router, t, toast]);

  return (
    <button
      type="button"
      className="sa-btn-delete"
      onClick={() => void handleDelete()}
      disabled={loading}
    >
      {loading ? t("superAdmin.common.deleting") : t("superAdmin.companies.deleteCompany")}
    </button>
  );
}
