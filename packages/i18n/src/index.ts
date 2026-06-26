import es from "../locales/es.json";
import ca from "../locales/ca.json";

export const SUPPORTED_LOCALES = ["es", "ca"] as const;
export type FleetLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: FleetLocale = "es";

type MessageValue = string | { [key: string]: MessageValue };

const catalogs: Record<FleetLocale, MessageValue> = {
  es: es as MessageValue,
  ca: ca as MessageValue,
};

export function normalizeLocale(value: string | null | undefined): FleetLocale {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "ca") return "ca";
  if (raw === "en") return "ca";
  return "es";
}

function resolvePath(tree: MessageValue, key: string): string | undefined {
  const parts = key.split(".");
  let node: MessageValue = tree;
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return undefined;
    }
    const next = (node as { [key: string]: MessageValue })[part];
    if (next === undefined) return undefined;
    node = next;
  }
  return typeof node === "string" ? node : undefined;
}

export type TranslateParams = Record<string, string | number>;

export type Translator = (key: string, params?: TranslateParams) => string;

export function createTranslator(locale: FleetLocale): Translator {
  const primary = catalogs[locale];
  const fallback = catalogs[DEFAULT_LOCALE];

  return (key: string, params?: TranslateParams): string => {
    let text = resolvePath(primary, key) ?? resolvePath(fallback, key) ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function getMessages(locale: FleetLocale): MessageValue {
  return catalogs[locale];
}

export function flattenMessageKeys(tree: MessageValue, prefix = ""): string[] {
  if (typeof tree !== "object" || tree === null) return [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else {
      keys.push(...flattenMessageKeys(value, path));
    }
  }
  return keys;
}

export function messageAt(tree: MessageValue, key: string): string {
  return resolvePath(tree, key) ?? "";
}
