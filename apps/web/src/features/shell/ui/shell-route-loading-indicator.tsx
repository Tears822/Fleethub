"use client";

import { Loader2 } from "lucide-react";

/** Non-blocking route transition feedback (main content only — sidebar stays usable). */
export function ShellRouteLoadingIndicator({ pending }: { pending: boolean }) {
  if (!pending) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-50/75 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando pantalla"
    >
      <Loader2 className="h-9 w-9 animate-spin text-orange-500" aria-hidden />
      <p className="text-sm font-medium text-zinc-700">Cargando pantalla…</p>
    </div>
  );
}
