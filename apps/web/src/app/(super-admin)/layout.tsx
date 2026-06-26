import { redirect } from "next/navigation";
import { isPlatformSession } from "@fleethub/auth";
import { getSession } from "@/features/auth/server/session.service";
import { isSuperAdmin } from "@/domain/platform.policy";
import { SuperAdminShell } from "@/features/super-admin/shell/super-admin-shell";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!isPlatformSession(session) || !isSuperAdmin(session)) {
    redirect("/dashboard");
  }
  return <SuperAdminShell session={session}>{children}</SuperAdminShell>;
}
