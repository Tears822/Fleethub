/** Parse labels like `0h 29min` into total minutes. */
export function parseConnectedMinutesLabel(label: string): number {
  const m = label.trim().match(/(\d+)\s*h\s*(\d+)\s*min/i);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

/**
 * €/hora when connected time is ≥60 min; otherwise total gross (no hourly extrapolation).
 * Never exceeds gross billed when under one hour.
 */
export function resolveEurPerHourFromConnectedMinutes(
  grossCents: number | bigint,
  connectedMinutes: number,
): number {
  const grossEuros = Number(grossCents) / 100;
  const minutes = Math.max(0, Math.round(connectedMinutes));
  if (minutes < 60) {
    return Math.round(grossEuros * 100) / 100;
  }
  const hours = minutes / 60;
  if (hours <= 0) return 0;
  return Math.round((grossEuros / hours) * 10) / 10;
}

/** Apps table label (1 decimal; 2 decimals when showing gross for shifts under 1 h). */
export function formatAppsEurHora(
  grossCents: number | bigint,
  connectedMinutes: number,
): string {
  const grossEuros = Number(grossCents) / 100;
  const minutes = Math.max(0, Math.round(connectedMinutes));
  if (minutes < 60) {
    if (grossEuros <= 0) return "0,0 €";
    return `${grossEuros.toFixed(2).replace(".", ",")} €`;
  }
  const value = resolveEurPerHourFromConnectedMinutes(grossCents, connectedMinutes);
  if (value <= 0) return "0,0 €";
  return `${value.toFixed(1).replace(".", ",")} €`;
}

/** Client-safe: derive €/hora display from facturación + horas column text. */
export function formatAppsEurHoraFromLabel(facturacionEur: number, horasLabel: string): string {
  const minutes = parseConnectedMinutesLabel(horasLabel);
  if (minutes < 60) {
    if (facturacionEur <= 0) return "0,0 €";
    return `${facturacionEur.toFixed(2).replace(".", ",")} €`;
  }
  const hours = minutes / 60;
  if (hours <= 0 || facturacionEur <= 0) return "0,0 €";
  const eurH = Math.round((facturacionEur / hours) * 10) / 10;
  return `${eurH.toFixed(1).replace(".", ",")} €`;
}

export function resolveEurPerHourFromLabel(facturacionEur: number, horasLabel: string): number {
  const minutes = parseConnectedMinutesLabel(horasLabel);
  if (minutes < 60) {
    return Math.round(facturacionEur * 100) / 100;
  }
  const hours = minutes / 60;
  if (hours <= 0) return 0;
  return Math.round((facturacionEur / hours) * 10) / 10;
}
