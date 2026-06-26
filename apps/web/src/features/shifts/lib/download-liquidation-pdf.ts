import { buildApiUrl } from "@/shared/lib/api-url";

type DownloadLiquidationPdfInput = {
  driverId: string;
  tripIds: string[];
  allowClosed?: boolean;
  note?: string;
  filename?: string;
};

export async function downloadLiquidationPdf(input: DownloadLiquidationPdfInput): Promise<void> {
  const params = new URLSearchParams();
  params.set("driverId", input.driverId);
  params.set("tripIds", input.tripIds.join(","));
  if (input.allowClosed) params.set("allowClosed", "1");
  if (input.note) params.set("note", input.note);

  const res = await fetch(buildApiUrl(`/api/tenant/shifts/liquidation-pdf?${params}`), {
    credentials: "include",
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "No se pudo generar el PDF");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? input.filename ?? "liquidacion.pdf";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
