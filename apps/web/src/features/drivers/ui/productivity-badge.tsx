import type { ProductivityLevel } from "@fleethub/auth/driver-productivity";

const STYLES: Record<ProductivityLevel, string> = {
  ok: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-100 text-amber-900 ring-amber-200",
  low: "bg-red-100 text-red-800 ring-red-200",
  none: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

const LABELS: Record<ProductivityLevel, string> = {
  ok: "OK",
  warn: "Medio",
  low: "Bajo",
  none: "—",
};

export function ProductivityBadge({ level }: { level?: ProductivityLevel }) {
  const l = level ?? "none";
  return (
    <span
      className={`inline-flex min-w-[3rem] justify-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${STYLES[l]}`}
      title="Productividad mes en curso (€/h y umbrales de Configuración)"
    >
      {LABELS[l]}
    </span>
  );
}
