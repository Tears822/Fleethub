"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { parseAnalyticsPlatformFilter } from "@/features/analytics/lib/analytics-platform";
import { ExportFileButton } from "@/shared/ui/export-file-button";

export function AnaliticaPageActions({
  fromIso,
  toIso,
  canExport,
}: {
  fromIso: string;
  toIso: string;
  canExport: boolean;
}) {
  const searchParams = useSearchParams();
  const platform = parseAnalyticsPlatformFilter(searchParams.get("platform") ?? undefined);

  const href = useMemo(() => {
    const params = new URLSearchParams({ from: fromIso, to: toIso });
    if (platform !== "total") params.set("platform", platform);
    return `/api/tenant/export/analitica.xlsx?${params.toString()}`;
  }, [fromIso, platform, toIso]);

  if (!canExport) return null;

  return (
    <ExportFileButton href={href} label="Exportar Excel" filename="analitica.xlsx" />
  );
}
