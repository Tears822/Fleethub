export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map((c) => escapeCsvCell(c ?? "")).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
