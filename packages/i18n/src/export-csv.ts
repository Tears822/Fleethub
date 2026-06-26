/**
 * Export i18n strings to CSV for translators (Spanish source + Catalan target).
 *
 *   npm run export:csv -w @fleethub/i18n
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenMessageKeys,
  getMessages,
  messageAt,
  type FleetLocale,
} from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDocs = path.resolve(__dirname, "../../../docs/i18n");

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(sourceLocale: FleetLocale, targetLocale: FleetLocale, outPath: string) {
  const source = getMessages(sourceLocale);
  const target = getMessages(targetLocale);
  const keys = flattenMessageKeys(source).sort((a, b) => a.localeCompare(b, "es"));

  const lines = ["key,es,ca,notes"];
  for (const key of keys) {
    const es = messageAt(source, key);
    const ca = messageAt(target, key);
    const notes = es === ca ? "same" : "";
    lines.push([csvEscape(key), csvEscape(es), csvEscape(ca), csvEscape(notes)].join(","));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${keys.length} keys → ${outPath}`);
}

exportCsv("es", "ca", path.join(repoDocs, "FleetHub-strings-es-ca.csv"));

// Also copy JSON locale files for technical reviewers
fs.mkdirSync(repoDocs, { recursive: true });
fs.copyFileSync(
  path.resolve(__dirname, "../locales/es.json"),
  path.join(repoDocs, "es.json"),
);
fs.copyFileSync(
  path.resolve(__dirname, "../locales/ca.json"),
  path.join(repoDocs, "ca.json"),
);

console.log(`Copied JSON locales → ${repoDocs}/`);
