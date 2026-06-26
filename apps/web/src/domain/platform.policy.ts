import type { AppSession } from "@/domain/session.types";
import { isPlatformSession } from "@fleethub/auth";

export function isSuperAdmin(session: AppSession): boolean {
  return isPlatformSession(session) && session.role === "SUPER_ADMIN";
}
