"use client";

import { useCallback, useState } from "react";
import { Mail } from "lucide-react";
import type { DashboardAlertItem } from "@/features/dashboard/server/dashboard-alerts.queries";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

export function DashboardAlertsEmailButton({
  alerts,
  smtpConfigured,
  canSend,
}: {
  alerts: DashboardAlertItem[];
  smtpConfigured: boolean;
  canSend: boolean;
}) {
  const toast = useToast();
  const [sending, setSending] = useState(false);

  const actionable = alerts.filter((a) => a.id !== "all-clear");

  const handleSend = useCallback(async () => {
    if (actionable.length === 0) {
      toast.error("No hay alertas para enviar.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/notifications/send-digest"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alerts: actionable.map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string; sent?: number };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo enviar el resumen");
        return;
      }
      toast.success(`Resumen enviado a ${data.sent ?? 0} gestor(es).`);
    } catch {
      toast.error("No se pudo conectar con el API.");
    } finally {
      setSending(false);
    }
  }, [actionable, toast]);

  if (!canSend) return null;

  return (
    <button
      type="button"
      onClick={() => void handleSend()}
      disabled={sending || actionable.length === 0 || !smtpConfigured}
      title={
        !smtpConfigured
          ? "Configura SMTP_USER y SMTP_PASS en el servidor"
          : actionable.length === 0
            ? "Sin alertas"
            : undefined
      }
      className="erp-btn-outline inline-flex items-center gap-1.5 text-xs normal-case"
    >
      <Mail className="h-3.5 w-3.5" aria-hidden />
      {sending ? "Enviando…" : "Enviar resumen por email"}
    </button>
  );
}
