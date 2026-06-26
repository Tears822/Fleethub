import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookPlatform = "uber" | "freenow";

/** Uber Vehicle Suppliers: HMAC-SHA256 hex of raw body using app client secret (dashboard). */
export function resolveUberWebhookSecret(): string | undefined {
  return (
    process.env.WEBHOOK_UBER_SIGNING_SECRET?.trim() ||
    process.env.UBER_CLIENT_SECRET?.trim() ||
    undefined
  );
}

function envSecret(platform: WebhookPlatform): string | undefined {
  if (platform === "uber") {
    return resolveUberWebhookSecret();
  }
  return (
    process.env.WEBHOOK_FREENOW_SIGNING_SECRET?.trim() ||
    process.env.WEBHOOK_FREENOW_TOKEN?.trim() ||
    undefined
  );
}

function requireSignature(): boolean {
  const v = process.env.WEBHOOK_REQUIRE_SIGNATURE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseSignatureHeader(header: string | undefined): string | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  const eq = trimmed.indexOf("=");
  if (eq > 0) {
    return trimmed.slice(eq + 1).trim();
  }
  return trimmed;
}

function verifyHmacSha256Hex(payload: Buffer, signatureHex: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex.replace(/^sha256=/i, ""), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type WebhookVerifyResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; status: 401; message: string };

/** Verify platform webhook authenticity when secrets are configured. */
export function verifyPlatformWebhook(
  platform: WebhookPlatform,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): WebhookVerifyResult {
  const secret = envSecret(platform);
  if (!secret) {
    if (requireSignature()) {
      return {
        ok: false,
        status: 401,
        message: `Webhook ${platform}: firma requerida pero no hay secreto configurado.`,
      };
    }
    return { ok: true, skipped: true };
  }

  if (platform === "freenow" && secret.length < 64) {
    const auth = headers.authorization;
    const token =
      typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")
        ? auth.slice(7).trim()
        : null;
    const headerToken =
      typeof headers["x-fleethub-webhook-token"] === "string"
        ? headers["x-fleethub-webhook-token"]
        : null;
    if (token === secret || headerToken === secret) {
      return { ok: true };
    }
    return { ok: false, status: 401, message: "Token de webhook FreeNow no válido." };
  }

  const sigHeader =
    platform === "uber"
      ? (headers["x-uber-signature"] ??
        headers["x-postmates-signature"] ??
        headers["x-signature"])
      : headers["x-freenow-signature"] ?? headers["x-signature"];

  const signature = parseSignatureHeader(
    typeof sigHeader === "string" ? sigHeader : Array.isArray(sigHeader) ? sigHeader[0] : undefined,
  );

  if (!signature) {
    return { ok: false, status: 401, message: "Cabecera de firma ausente." };
  }

  if (!verifyHmacSha256Hex(rawBody, signature, secret)) {
    return { ok: false, status: 401, message: "Firma de webhook no válida." };
  }

  return { ok: true };
}
