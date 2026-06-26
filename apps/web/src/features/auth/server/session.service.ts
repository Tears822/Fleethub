import "server-only";

import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FH_SESSION_COOKIE, signSessionToken } from "@fleethub/auth";
import type { AppSession } from "@/domain/session.types";
import {
  isProduction,
  tryGetAuthSecretBytes,
} from "@/shared/config/env.server";

export { FH_SESSION_COOKIE, signSessionToken };

export type TenantSession = AppSession & { kind: "tenant"; tid: string };

export async function getSession(): Promise<AppSession | null> {
  try {
    const key = tryGetAuthSecretBytes();
    if (!key) {
      return null;
    }
    const token = (await cookies()).get(FH_SESSION_COOKIE)?.value;
    if (!token) {
      return null;
    }
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as AppSession;
  } catch {
    return null;
  }
}

export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.kind !== "tenant" || !session.tid) {
    redirect(session.kind === "platform" ? "/super-admin" : "/login");
  }
  return session as TenantSession;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(FH_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
