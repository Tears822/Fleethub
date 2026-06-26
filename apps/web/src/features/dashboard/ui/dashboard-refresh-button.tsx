"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { requestPlatformSyncPoll } from "@/features/integrations/lib/request-platform-sync";
import { useToast } from "@/shared/ui/toast-provider";

/**
 * Manual refresh for Admin / Gestor: encola sync puntual (complemento a webhooks) y recarga el panel.
 * Webhooks remain the primary ingestion path; this is for operator peace of mind.
 */
export function DashboardRefreshButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestPlatformSyncPoll();

      router.refresh();

      if (result.ok) {
        toast.success(result.message ?? "Datos del panel actualizados.");
        return;
      }
      if (result.status === 503 && result.queueUnavailable) {
        toast.info("Panel actualizado. La cola de sincronización no está disponible.");
        return;
      }
      toast.error(result.error ?? "No se pudo solicitar la actualización.");
    } catch {
      router.refresh();
      toast.error("No se pudo conectar con el servidor. Panel recargado.");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => void handleRefresh()}
      disabled={loading}
      title="Solicitar sincronización con plataformas y actualizar el panel"
      className="erp-btn-outline inline-flex items-center gap-1.5 text-xs normal-case"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
      {loading ? "Actualizando…" : "Más actual"}
    </button>
  );
}
