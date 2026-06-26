import { resolveCompanyScopeForSession } from "@fleethub/auth/tenant-scope";
import { readCompanyScopeCookieSelection } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { listCompanyScopeOptions } from "@/features/companies/server/company-scope-options.queries";
import { AppShell } from "@/features/shell/ui/app-shell";
import { CompanyScopeProvider } from "@/features/shell/ui/company-scope-provider";
import { COMPANY_SCOPE_ALL } from "@/features/shell/lib/company-scope-cookie";

export const dynamic = "force-dynamic";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireTenantSession();

  const baseScope = await resolveCompanyScopeForSession(session);
  const companies = await listCompanyScopeOptions(session.tid, baseScope);
  const cookieSelection = await readCompanyScopeCookieSelection(session);
  const initialSelectedId =
    companies.length === 1
      ? companies[0]!.id
      : cookieSelection !== COMPANY_SCOPE_ALL &&
          companies.some((c) => c.id === cookieSelection)
        ? cookieSelection
        : COMPANY_SCOPE_ALL;

  return (
    <CompanyScopeProvider
      tenantId={session.tid}
      companies={companies}
      initialSelectedId={initialSelectedId}
    >
      <AppShell session={session}>{children}</AppShell>
    </CompanyScopeProvider>
  );
}
