"use client";

type SplitGroupProps = {
  title: string;
  driverPct: string;
  onDriverPctChange: (value: string) => void;
  disabled?: boolean;
};

function empresaPct(driverPct: string): string {
  const n = Number(driverPct.replace(",", "."));
  if (driverPct.trim() === "" || Number.isNaN(n)) return "—";
  return String(Math.max(0, Math.min(100, 100 - Math.round(n))));
}

export function DriverEconomicSplitGroup({
  title,
  driverPct,
  onDriverPctChange,
  disabled = false,
}: SplitGroupProps) {
  const empresa = empresaPct(driverPct);

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-800">{title}</h4>
      <label className="erp-label block text-xs">
        Conductor
        <div className="mt-1 flex items-center gap-2">
          <input
            className="erp-input w-full tabular-nums"
            type="number"
            min={0}
            max={100}
            step={1}
            value={driverPct}
            onChange={(e) => onDriverPctChange(e.target.value)}
            disabled={disabled}
          />
          <span className="shrink-0 text-sm font-medium text-zinc-600">%</span>
        </div>
      </label>
      <label className="erp-label block text-xs">
        Empresa
        <div className="mt-1 flex items-center gap-2">
          <input
            className="erp-input w-full tabular-nums bg-white text-zinc-700"
            type="text"
            readOnly
            tabIndex={-1}
            value={empresa}
            aria-label={`Empresa ${empresa} por ciento`}
          />
          <span className="shrink-0 text-sm font-medium text-zinc-600">%</span>
        </div>
      </label>
    </div>
  );
}
