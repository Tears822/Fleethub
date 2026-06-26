import { Loader2 } from "lucide-react";

export default function ShellRouteLoading() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-zinc-600"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-9 w-9 animate-spin text-orange-500" aria-hidden />
      <p className="text-sm font-medium text-zinc-700">Cargando pantalla…</p>
    </div>
  );
}
