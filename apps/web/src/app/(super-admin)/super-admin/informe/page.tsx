import { getSession } from "@/features/auth/server/session.service";
import { listActiveDriversByDateRange } from "@/features/super-admin/server/reports.queries";
import { resolveInformeDateRange } from "@/features/super-admin/lib/informe-date-range";
import { SuperAdminInformeReport } from "@/features/super-admin/ui/super-admin-informe-report";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";
import type { TenantCommercialStatus } from "@fleethub/db";

const COMMERCIAL_STATUSES = new Set<TenantCommercialStatus>(["ACTIVE", "TRIAL", "SUSPENDED"]);

type PlatformFilter = "all" | "uber" | "freenow";
type StatusFilter = "all" | TenantCommercialStatus;

function parseStatusFilter(raw?: string): StatusFilter {
  if (raw && COMMERCIAL_STATUSES.has(raw as TenantCommercialStatus)) {
    return raw as TenantCommercialStatus;
  }
  return "all";
}

function parsePlatformFilter(raw?: string): PlatformFilter {
  if (raw === "uber" || raw === "freenow") return raw;
  return "all";
}

export default async function SuperAdminInformePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    year?: string;
    month?: string;
    q?: string;
    status?: string;
    platform?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const sp = await searchParams;
  const range = resolveInformeDateRange(sp);
  const rows = await listActiveDriversByDateRange(range.dateFrom, range.dateTo);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.informe.title")}
      subtitle={t("superAdmin.pages.informe.subtitle")}
      backHref="/super-admin"
    >
      <SuperAdminCard className="overflow-hidden p-0">
        <SuperAdminInformeReport
          rows={rows}
          range={range}
          initialQ={sp.q ?? ""}
          initialStatus={parseStatusFilter(sp.status)}
          initialPlatform={parsePlatformFilter(sp.platform)}
        />
      </SuperAdminCard>
      <p className="text-xs text-zinc-500">
        {t("superAdmin.pages.informe.demoHint")}{" "}
        <code className="text-[11px]">?from=2026-04-01&amp;to=2026-05-31</code> (demo-a).
      </p>
    </SuperAdminPageChrome>
  );
}
