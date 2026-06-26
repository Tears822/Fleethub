"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

/** Recalculates today's driver_platform_day_metrics and reloads /apps. */
export function AppsRefreshButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/live/refresh-day-metrics"), {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; buckets?: number };
      router.refresh();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudieron actualizar las métricas.");
        return;
      }
      const n = data.buckets ?? 0;
      toast.success(
        n > 0
          ? `Métricas del día actualizadas (${n} conductor${n === 1 ? "" : "es"}).`
          : "Métricas actualizadas. Sin viajes hoy en el ámbito seleccionado.",
      );
    } catch {
      router.refresh();
      toast.error("No se pudo conectar con el servidor. Pantalla recargada.");
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
      title="Recalcular horas y aceptación del día desde viajes y métricas de plataforma"
      className="erp-btn-outline inline-flex items-center gap-1.5 text-xs normal-case"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
      {loading ? "Actualizando…" : "Actualizar métricas"}
    </button>
  );
}
