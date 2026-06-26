import "server-only";

import { getAccountProfile } from "@fleethub/auth";
import type { TenantSession } from "@/features/auth/server/session.service";

export async function loadAccountProfileForSession(session: TenantSession) {
  const result = await getAccountProfile(session);
  if (!result.ok) {
    return { firstName: "", lastName: "" };
  }
  return result.value;
}
