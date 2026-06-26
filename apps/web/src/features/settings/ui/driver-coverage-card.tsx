import type { TenantDriverCoverage } from "@fleethub/auth";

function platformLabel(platform: string): string {
  if (platform === "UBER") return "Uber";
  if (platform === "FREENOW") return "FreeNow";
  return platform;
}

function coverageTone(pct: number): string {
  if (pct >= 70) return "text-emerald-700";
  if (pct >= 40) return "text-amber-700";
  return "text-red-700";
}

function CoverageBar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
      <div
        className={`h-full rounded-full transition-all ${
          pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
        }`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function DriverCoverageCard({ coverage }: { coverage: TenantDriverCoverage }) {
  return (
    <div className="mt-6 rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-violet-950">Cobertura de conductores (24 h)</p>
      <p className="mt-0.5 text-xs leading-relaxed text-violet-900/85">
        Vinculados con al menos un viaje ingresado en las últimas 24 horas (proxy de actividad
        operativa).
      </p>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-violet-950">Total Uber + FreeNow</span>
          <span className={`text-sm font-bold tabular-nums ${coverageTone(coverage.coveragePct)}`}>
            {coverage.coveragePct}%
          </span>
        </div>
        <p className="text-xs text-violet-800/90">
          {coverage.activeLast24h} activos / {coverage.linkedDrivers} vinculados
        </p>
        <CoverageBar pct={coverage.coveragePct} />
      </div>

      <ul className="mt-4 space-y-3 border-t border-violet-100/80 pt-3">
        {coverage.byPlatform.map((p) => (
          <li key={p.platform}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-violet-950">{platformLabel(p.platform)}</span>
              <span className={`text-xs font-bold tabular-nums ${coverageTone(p.coveragePct)}`}>
                {p.coveragePct}%
              </span>
            </div>
            <p className="text-[11px] text-violet-800/85">
              {p.activeLast24h} / {p.linkedDrivers} vinculados
            </p>
            <CoverageBar pct={p.coveragePct} />
          </li>
        ))}
      </ul>
    </div>
  );
}
