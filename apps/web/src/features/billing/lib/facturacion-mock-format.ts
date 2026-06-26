import {
  formatEuroAmount,
  parseEuroAmount,
} from "@/shared/lib/format-euro";

/** @deprecated Use parseEuroAmount */
export function parseEuroCell(value: string): number {
  return parseEuroAmount(value);
}

/** Format euro amounts as `14,20 €` (Spanish locale, 2 decimals). */
export function formatEuroCell(amount: number): string {
  return formatEuroAmount(amount);
}

export function parseServicesCell(value: string): number {
  const n = Number.parseInt(value.replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function formatServicesCell(count: number): string {
  return count.toLocaleString("es-ES");
}
