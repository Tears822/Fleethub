import "./install-web-crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AppSession } from "./types";
import { getAuthSecretBytes } from "./secret";
import { SESSION_MAX_AGE_SECONDS } from "./session-duration";

export async function signSessionToken(payload: AppSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .setIssuedAt()
    .sign(getAuthSecretBytes());
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecretBytes());
    if (payload.kind !== "tenant" && payload.kind !== "platform") return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return payload as unknown as AppSession;
  } catch {
    return null;
  }
}
