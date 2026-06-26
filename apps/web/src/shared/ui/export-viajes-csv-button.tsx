"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

const SYNC_PATH = "/api/tenant/export/viajes.csv";
const ASYNC_START_PATH = "/api/tenant/export/viajes/async";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportViajesCsvButton() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function pollAndDownload(jobId: string) {
    const statusUrl = buildApiUrl(`/api/tenant/export/jobs/${jobId}`);
    const downloadUrl = buildApiUrl(`/api/tenant/export/jobs/${jobId}/download`);

    for (let attempt = 0; attempt < 90; attempt++) {
      await sleep(2000);
      const statusRes = await fetch(statusUrl, { credentials: "include" });
      if (!statusRes.ok) {
        throw new Error("No se pudo consultar el estado de la exportación.");
      }
      const status = (await statusRes.json()) as {
        state: string;
        failedReason?: string | null;
      };
      if (status.state === "failed") {
        throw new Error(status.failedReason ?? "La exportación falló.");
      }
      if (status.state === "completed") {
        const dlRes = await fetch(downloadUrl, { credentials: "include" });
        if (!dlRes.ok) throw new Error("No se pudo descargar el CSV.");
        await downloadBlob(dlRes, "viajes.csv");
        return;
      }
    }
    throw new Error("La exportación tardó demasiado. Inténtalo de nuevo más tarde.");
  }

  async function onExport() {
    setLoading(true);
    try {
      const syncRes = await fetch(buildApiUrl(SYNC_PATH), { credentials: "include" });
      if (syncRes.ok) {
        await downloadBlob(syncRes, "viajes.csv");
        toast.success("Exportación descargada.");
        return;
      }

      const payload = (await syncRes.json().catch(() => ({}))) as {
        asyncRequired?: boolean;
        error?: string;
      };

      if (syncRes.status !== 409 || !payload.asyncRequired) {
        toast.error(payload.error ?? "No se pudo exportar");
        return;
      }

      toast.info("Generando CSV en segundo plano…");
      const startRes = await fetch(buildApiUrl(ASYNC_START_PATH), {
        method: "POST",
        credentials: "include",
      });
      const start = (await startRes.json()) as { jobId?: string; error?: string };
      if (!startRes.ok || !start.jobId) {
        toast.error(start.error ?? "No se pudo iniciar la exportación.");
        return;
      }

      await pollAndDownload(start.jobId);
      toast.success("Exportación descargada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar con el servidor.");
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
      {loading ? "Exportando…" : "CSV viajes"}
    </button>
  );
}
