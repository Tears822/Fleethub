import { formatLicenseUsage } from "@/features/companies/lib/company-profile";

export function EmpresaLicenciasDisplay({
  activeDrivers,
  licensedDrivers,
  className = "",
}: {
  activeDrivers: number;
  licensedDrivers: number | null;
  className?: string;
}) {
  const usage = formatLicenseUsage(activeDrivers, licensedDrivers);

  if (!usage.hasQuota) {
    return <span className={`text-zinc-500 ${className}`.trim()}>—</span>;
  }

  return (
    <span
      className={`tabular-nums ${usage.overCapacity ? "font-semibold text-amber-700" : "text-zinc-900"} ${className}`.trim()}
      title={
        usage.overCapacity
          ? "Conductores activos por encima del cupo contratado"
          : "Conductores activos / licencias contratadas"
      }
    >
      {usage.text}
      {usage.overCapacity ? (
        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
          Sobre cupo
        </span>
      ) : null}
    </span>
  );
}
