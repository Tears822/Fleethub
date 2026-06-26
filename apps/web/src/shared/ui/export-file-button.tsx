"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type ExportFileButtonProps = {
  href: string;
  label?: string;
  filename?: string;
};

export function ExportFileButton({
  href,
  label,
  filename = "export",
}: ExportFileButtonProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const buttonLabel = label ?? t("common.export");

  async function onExport() {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(href), { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? t("common.exportFailed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("common.exportDownloaded"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onExport()}
      disabled={loading}
      className="erp-btn-outline inline-flex items-center gap-2 normal-case"
    >
      <Download className="h-4 w-4" aria-hidden />
      {loading ? t("common.exporting") : buttonLabel}
    </button>
  );
}
