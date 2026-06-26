import { formatDateTimeShortInTenantTz } from "@/shared/lib/tenant-timezone";

type SyncRunRow = {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
};

export function IntegrationSyncPanel({ runs }: { runs: SyncRunRow[] }) {
  return (
    <div className="mt-8 border-t border-zinc-200 pt-6">
      <h2 className="text-sm font-semibold text-zinc-900">Integraciones — últimas sincronizaciones</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Ejecuciones registradas en <span className="font-mono">sync_runs</span> (worker BullMQ, Hito 3).
      </p>
      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          Aún no hay ejecuciones. Arranca el worker en modo <span className="font-mono">fleet</span> y encola un
          job con <span className="font-mono">npm run enqueue-sync -w @fleethub/worker -- &lt;slug&gt; UBER</span>.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600">
                <th className="py-2 pr-3 font-medium">Plataforma</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium">Inicio</th>
                <th className="py-2 pr-3 font-medium">Fin</th>
                <th className="py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 text-zinc-800">
                  <td className="py-2 pr-3 font-mono text-sky-700">{r.platform}</td>
                  <td className="py-2 pr-3">{r.status}</td>
                  <td className="py-2 pr-3 text-zinc-600">
                    {formatDateTimeShortInTenantTz(r.startedAt)}
                  </td>
                  <td className="py-2 pr-3 text-zinc-600">
                    {r.finishedAt ? formatDateTimeShortInTenantTz(r.finishedAt) : "—"}
                  </td>
                  <td className="max-w-xs truncate py-2 text-zinc-500" title={r.errorMessage ?? undefined}>
                    {r.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
