"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { SortDir } from "@/shared/lib/table-sort";

type VuiSortableThProps = {
  label: string;
  activeDir: SortDir | null;
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
};

export function VuiSortableTh({
  label,
  activeDir,
  onSort,
  align = "left",
  className = "",
}: VuiSortableThProps) {
  const thClass = [align === "right" ? "text-right" : "", className].filter(Boolean).join(" ");

  return (
    <th className={thClass}>
      <button
        type="button"
        onClick={onSort}
        aria-label={`Ordenar por ${label}`}
        className={[
          "group inline-flex w-full items-center gap-1 uppercase tracking-wide",
          align === "right" ? "justify-end" : "justify-start",
        ].join(" ")}
      >
        <span className="text-[10px] font-bold text-zinc-500 group-hover:text-zinc-800">
          {label}
        </span>
        <span
          className="inline-flex w-3 shrink-0 flex-col items-center leading-none"
          aria-hidden
        >
          <ChevronUp
            className={[
              "h-2.5 w-2.5",
              activeDir === "asc" ? "text-zinc-800" : "text-zinc-300",
            ].join(" ")}
            strokeWidth={2.5}
          />
          <ChevronDown
            className={[
              "-mt-0.5 h-2.5 w-2.5",
              activeDir === "desc" ? "text-zinc-800" : "text-zinc-300",
            ].join(" ")}
            strokeWidth={2.5}
          />
        </span>
      </button>
    </th>
  );
}
