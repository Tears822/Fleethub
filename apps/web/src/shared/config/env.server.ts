import "server-only";

import { getAuthSecretBytes, readOptionalAuthSecretBytes } from "@fleethub/auth";
import { getPublicAppUrl, getPublicApiBaseUrl } from "@/shared/config/public-env";

export function tryGetAuthSecretBytes(): Uint8Array | null {
  return readOptionalAuthSecretBytes();
}

export { getAuthSecretBytes };

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Server-side access to the same public URLs (e.g. emails, server-side fetch to public API). */
export function getServerPublicAppUrl(): string {
  return getPublicAppUrl();
}

export function getServerPublicApiBaseUrl(): string {
  return getPublicApiBaseUrl();
}
