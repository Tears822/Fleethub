import "./install-web-crypto";
import { SignJWT, jwtVerify } from "jose";
import { getAuthSecretBytes } from "./secret";

export type Pending2faClaims = {
  sub: string;
  email: string;
  role: string;
  kind: "tenant" | "platform";
  tid?: string;
  slug?: string;
  name?: string;
  purpose: "pending_2fa";
};

export async function signPending2faToken(claims: Omit<Pending2faClaims, "purpose">): Promise<string> {
  return new SignJWT({ ...claims, purpose: "pending_2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(getAuthSecretBytes());
}

export async function verifyPending2faToken(token: string): Promise<Pending2faClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecretBytes());
    if (payload.purpose !== "pending_2fa") return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    if (payload.kind !== "tenant" && payload.kind !== "platform") return null;
    return payload as unknown as Pending2faClaims;
  } catch {
    return null;
  }
}
