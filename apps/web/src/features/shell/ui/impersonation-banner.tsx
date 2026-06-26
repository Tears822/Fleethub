"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

export function ImpersonationBanner({ tenantSlug }: { tenantSlug: string }) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleEnd = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/super-admin/impersonate/end"), {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo salir de la vista del tenant");
        return;
      }
      router.push(data.redirectTo ?? "/super-admin");
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el API.");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Vista Super Admin (solo lectura) — tenant{" "}
      <span className="font-semibold">{tenantSlug}</span>.{" "}
      <button
        type="button"
        onClick={() => void handleEnd()}
        disabled={loading}
        className="font-semibold underline underline-offset-2 hover:text-amber-800"
      >
        {loading ? "Saliendo…" : "Volver al panel SA"}
      </button>
    </div>
  );
}
