import type { FastifyRequest } from "fastify";
import { FH_SESSION_COOKIE } from "@fleethub/auth/constants";
import { verifySessionToken } from "@fleethub/auth";
import type { AppSession } from "@fleethub/auth";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

export async function readSession(request: FastifyRequest): Promise<AppSession | null> {
  const token = parseCookie(request.headers.cookie, FH_SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}

export function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return request.ip ?? null;
}
