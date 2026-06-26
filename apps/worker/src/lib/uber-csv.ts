/** Minimal RFC4180-style CSV parser (handles quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && next === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function csvRowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0]!.map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const cells of rows.slice(1)) {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      if (!key) continue;
      obj[key] = (cells[i] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}
