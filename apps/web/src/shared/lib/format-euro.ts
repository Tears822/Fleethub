/** Parse Spanish amounts: `1.482,00 €`, `14,20 €`, legacy `1.482 €`, Intl `14,20 €`. */
export function parseEuroAmount(value: string): number {
  const t = value
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/EUR/gi, "")
    .trim();
  const neg = t.startsWith("-");
  const digits = t.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(digits);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/** Always two decimals: `14,20 €`. */
export function formatEuroAmount(amount: number): string {
  const formatted = amount.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} €`;
}

export function eurosFromCents(cents: number | bigint): number {
  return Math.round(Number(cents)) / 100;
}

export function formatEuroFromCents(cents: number | bigint): string {
  return formatEuroAmount(eurosFromCents(cents));
}

export function formatEuroSignedFromCents(cents: number | bigint): string {
  const n = Number(cents);
  const abs = formatEuroFromCents(n < 0 ? -n : n);
  return n < 0 ? `-${abs}` : abs;
}
