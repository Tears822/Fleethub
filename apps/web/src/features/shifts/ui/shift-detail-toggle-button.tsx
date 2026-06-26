"use client";

import { Eye, EyeOff } from "lucide-react";

type ShiftDetailToggleButtonProps = {
  expanded: boolean;
  onToggle: () => void;
  labelCollapsed?: string;
  labelExpanded?: string;
};

export function ShiftDetailToggleButton({
  expanded,
  onToggle,
  labelCollapsed = "Ver",
  labelExpanded = "Ocultar",
}: ShiftDetailToggleButtonProps) {
  const label = expanded ? labelExpanded : labelCollapsed;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className={[
        "erp-btn-edit inline-flex h-[2.35rem] w-[5.75rem] shrink-0 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5",
        expanded ? "border-zinc-400 bg-zinc-100 ring-1 ring-zinc-300" : "",
      ].join(" ")}
    >
      {expanded ? (
        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="whitespace-nowrap text-[9px] font-semibold leading-none">{label}</span>
    </button>
  );
}
