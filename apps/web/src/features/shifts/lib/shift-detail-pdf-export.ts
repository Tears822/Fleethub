import { downloadLiquidationPdf } from "@/features/shifts/lib/download-liquidation-pdf";
import type {
  CerrarTurnosRow,
  ShiftLiveDetailInput,
  ShiftPlatformName,
  ShiftTableRow,
} from "@/features/shifts/ui/cerrar-turnos-types";

export function resolveShiftDetailPdfExport(
  row: ShiftTableRow & {
    tripIds?: string[];
    tripIdsByPlatform?: CerrarTurnosRow["tripIdsByPlatform"];
  },
  live: ShiftLiveDetailInput | undefined,
  platform?: ShiftPlatformName,
): { driverId: string; tripIds: string[] } | null {
  const driverId = live?.driverId;
  if (!driverId) return null;

  if (platform) {
    const key = platform === "Uber" ? "UBER" : "FREENOW";
    const platformIds = row.tripIdsByPlatform?.[key];
    if (platformIds?.length) return { driverId, tripIds: platformIds };
  }

  const tripIds = live?.tripIds?.length ? live.tripIds : (row.tripIds ?? []);
  if (!tripIds.length) return null;
  return { driverId, tripIds };
}

export async function downloadShiftDetailPdf(input: {
  row: ShiftTableRow & {
    conductor: string;
    tripIds?: string[];
    tripIdsByPlatform?: CerrarTurnosRow["tripIdsByPlatform"];
  };
  live?: ShiftLiveDetailInput;
  platform?: ShiftPlatformName;
  allowClosed?: boolean;
}): Promise<void> {
  const resolved = resolveShiftDetailPdfExport(input.row, input.live, input.platform);
  if (!resolved) {
    throw new Error("No hay viajes para generar el PDF.");
  }

  const slug = input.row.conductor.replace(/\s+/g, "-").toLowerCase();
  const platformSlug = input.platform?.toLowerCase() ?? "turno";

  await downloadLiquidationPdf({
    driverId: resolved.driverId,
    tripIds: resolved.tripIds,
    allowClosed: input.allowClosed ?? input.live?.liquidationStatus === "closed",
    filename: `liquidacion-${slug}-${platformSlug}.pdf`,
  });
}
