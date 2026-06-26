import type { MockTopDriver } from "../mock/dashboard-mock";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardTopDriversMock({
  title,
  subtitle,
  drivers,
  emptyMessage = "Sin viajes cerrados hoy para mostrar ranking.",
}: {
  title: string;
  subtitle: string;
  drivers: MockTopDriver[];
  emptyMessage?: string;
}) {
  const max = Math.max(...drivers.map((d) => d.euro), 1);

  return (
    <div className="erp-kpi-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {drivers.length === 0 ? (
        <p className="mt-5 py-8 text-center text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
      <ul className="mt-5 space-y-4">
        {drivers.map((d, rank) => {
          const pct = Math.round((d.euro / max) * 100);
          return (
            <li key={d.name} className="min-w-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-zinc-900">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600">
                    {rank + 1}
                  </span>
                  <span className="truncate font-medium">{d.name}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-emerald-700">{formatEuro(d.euro)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
