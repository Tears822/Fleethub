import {
  formatIngestLatencyMs,
  ingestSourceLabel,
  type IngestionKpiSummary,
} from "@/features/integrations/lib/ingestion-kpis";

export function IngestionKpisCard({ kpis }: { kpis: IngestionKpiSummary }) {
  if (kpis.totalEvents === 0) {
    return (
      <div className="mt-6 rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3">
        <p className="text-xs font-semibold text-sky-950">Ingesta por evento (24 h)</p>
        <p className="mt-1 text-xs leading-relaxed text-sky-900/85">
          Aún no hay eventos registrados. Cada viaje sincronizado o webhook generará una fila de
          telemetría (duplicados, latencia, origen).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-sky-950">Ingesta por evento (24 h)</p>
      <p className="mt-0.5 text-xs leading-relaxed text-sky-900/85">
        Telemetría unificada: colisiones entre webhook y poll, latencia recepción → BD.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <span className="text-[11px] font-semibold text-sky-950">Eventos</span>
          <p className="text-sm font-bold tabular-nums text-sky-900">{kpis.totalEvents}</p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-sky-950">Duplicados (origen distinto)</span>
          <p
            className={`text-sm font-bold tabular-nums ${kpis.duplicates > 0 ? "text-amber-700" : "text-sky-900"}`}
          >
            {kpis.duplicates}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-sky-950">Latencia media / p95</span>
          <p className="text-sm font-bold tabular-nums text-sky-900">
            {formatIngestLatencyMs(kpis.avgLatencyMs)}
            {kpis.p95LatencyMs != null ? (
              <span className="font-normal text-sky-800/80">
                {" "}
                · p95 {formatIngestLatencyMs(kpis.p95LatencyMs)}
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-sky-950">Webhook / poll</span>
          <p className="text-sm font-bold tabular-nums text-sky-900">{kpis.webhookSharePct}%</p>
        </div>
      </div>

      {kpis.bySource.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-sky-100/80 pt-3">
          {kpis.bySource.slice(0, 6).map((row) => (
            <li
              key={row.source}
              className="rounded-full border border-sky-200/80 bg-white/80 px-2 py-0.5 text-[10px] text-sky-900"
            >
              {ingestSourceLabel(row.source)}{" "}
              <span className="font-bold tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
