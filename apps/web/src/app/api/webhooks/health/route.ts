import { NextResponse } from "next/server";

function normalizeLoopbackApiBase(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return null;
    u.protocol = "http:";
    if (host === "localhost") u.hostname = "127.0.0.1";
    return u.origin;
  } catch {
    return null;
  }
}

function internalApiBase(): string {
  const internal = process.env.FLEETHUB_API_INTERNAL_URL?.trim();
  if (internal) {
    const normalized = normalizeLoopbackApiBase(internal);
    return (normalized ?? internal).replace(/\/+$/, "");
  }
  const pub = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (pub) {
    const normalized = normalizeLoopbackApiBase(pub);
    if (normalized) return normalized;
  }
  return "http://127.0.0.1:4000";
}

/** Diagnostics when Next rewrite to @fleethub/server fails (common: API not running on :4000). */
export async function GET() {
  const apiBase = internalApiBase();
  try {
    const res = await fetch(`${apiBase}/api/webhooks/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      return NextResponse.json({
        ...body,
        reachedVia: "next-app-route",
        apiBase,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "FleetHub API returned an error",
        apiBase,
        status: res.status,
        body,
      },
      { status: 503 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cannot reach FleetHub API",
        apiBase,
        hint:
          "On the server, run @fleethub/server (port 4000) and set NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:4000 in apps/web/.env.local. Optionally proxy /api/webhooks/ in nginx directly to :4000.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
