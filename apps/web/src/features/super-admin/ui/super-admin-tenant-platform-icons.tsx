"use client";

import { PlatformLogo } from "@/shared/ui/platform-logo";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminTenantPlatformIcons({
  hasUber,
  hasFreeNow,
}: {
  hasUber: boolean;
  hasFreeNow: boolean;
}) {
  const { t } = useTranslations();

  if (!hasUber && !hasFreeNow) {
    return <span className="text-zinc-400">—</span>;
  }

  const ariaLabel =
    hasUber && hasFreeNow
      ? t("superAdmin.common.platformsUberAndFreeNow")
      : hasUber
        ? t("superAdmin.common.platformUber")
        : t("superAdmin.common.platformFreeNow");

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={ariaLabel}>
      {hasUber ? <PlatformLogo id="uber" size="sm" /> : null}
      {hasFreeNow ? <PlatformLogo id="freenow" size="sm" /> : null}
    </div>
  );
}

export function SuperAdminTenantCompanyLines({
  companies,
  field,
}: {
  companies: { legalName: string; taxId: string | null }[];
  field: "taxId" | "legalName";
}) {
  if (companies.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {companies.map((c, index) => {
        const value = field === "taxId" ? c.taxId?.trim() || "—" : c.legalName;
        const className =
          field === "taxId"
            ? "font-mono text-[13px] leading-snug text-zinc-700"
            : "text-sm leading-snug text-zinc-800";
        return (
          <div key={`${field}-${index}-${c.legalName}`} className={className}>
            {value}
          </div>
        );
      })}
    </div>
  );
}
