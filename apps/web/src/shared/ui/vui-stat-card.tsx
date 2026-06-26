import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type VuiStatCardProps = {
  title: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: { text: string; positive?: boolean; tone?: "warning" | "danger" };
  hint?: ReactNode;
  /** Colored left bar per prototype KPI tiles */
  accent?: "green" | "amber" | "red" | "brand" | "teal";
  valueClassName?: string;
  className?: string;
};

const accentClass: Record<NonNullable<VuiStatCardProps["accent"]>, string> = {
  green: "erp-kpi-accent-green",
  amber: "erp-kpi-accent-amber",
  red: "erp-kpi-accent-red",
  brand: "border-l-4 border-l-orange-500",
  teal: "erp-kpi-accent-teal",
};

/** Compact ERP KPI tile — prototype style with optional left accent. */
export function VuiStatCard({
  title,
  value,
  icon: Icon,
  trend,
  hint,
  accent = "green",
  valueClassName = "",
  className = "",
}: VuiStatCardProps) {
  return (
    <div className={`erp-kpi-card ${accentClass[accent]} ${className}`.trim()}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{title}</p>
      <p
        className={`mt-1 flex flex-wrap items-baseline gap-1.5 text-2xl font-bold tabular-nums text-zinc-900 ${valueClassName}`.trim()}
      >
        <span>{value}</span>
        {trend ? (
          <span
            className={
              trend.tone === "warning"
                ? "text-xs font-semibold text-amber-600"
                : trend.tone === "danger" || trend.positive === false
                  ? "text-xs font-semibold text-red-600"
                  : "text-xs font-semibold text-emerald-600"
            }
          >
            {trend.text}
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</p> : null}
      {Icon ? <Icon className="sr-only" aria-hidden /> : null}
    </div>
  );
}
