"use client";

import { Loader2 } from "lucide-react";

type LoadingOverlayProps = {
  open: boolean;
  message?: string;
  /** Accessible label when `message` is omitted */
  label?: string;
};

/** Full-screen loading modal — blocks interaction until the request finishes. */
export function LoadingOverlay({
  open,
  message = "Cargando…",
  label = "Cargando",
}: LoadingOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={label}
    >
      <div className="w-full max-w-sm rounded-vision-xl border border-white/[0.12] bg-vision-card-dark p-8 text-center shadow-vision-xxl backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-vision-brand/15 ring-1 ring-vision-brand/30">
          <Loader2 className="h-7 w-7 animate-spin text-vision-brand" aria-hidden />
        </div>
        <p className="mt-5 text-sm font-semibold text-white">{message}</p>
        <p className="mt-1 text-xs text-vision-muted">Por favor, espera un momento</p>
      </div>
    </div>
  );
}
