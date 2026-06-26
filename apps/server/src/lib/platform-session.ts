import type { FastifyRequest } from "fastify";
import { FH_PLATFORM_SESSION_COOKIE, verifySessionToken } from "@fleethub/auth";
import type { AppSession } from "@fleethub/auth";
import { readSession } from "./session.js";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

/** Resolves the Super Admin platform session (direct login or while impersonating a tenant). */
export async function resolvePlatformSession(
  request: FastifyRequest,
): Promise<AppSession | null> {
  const platformToken = parseCookie(request.headers.cookie, FH_PLATFORM_SESSION_COOKIE);
  if (platformToken) {
    const platform = await verifySessionToken(platformToken);
    if (platform?.kind === "platform") return platform;
  }

  const session = await readSession(request);
  if (session?.kind === "platform") return session;

  if (session?.impersonating && session.platformActorSub && platformToken) {
    const platform = await verifySessionToken(platformToken);
    if (platform?.kind === "platform" && platform.sub === session.platformActorSub) {
      return platform;
    }
  }

  return null;
}

export async function requirePlatformSession(request: FastifyRequest): Promise<AppSession> {
  const session = await resolvePlatformSession(request);
  if (!session || session.kind !== "platform") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
