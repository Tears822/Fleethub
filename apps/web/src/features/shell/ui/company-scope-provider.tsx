"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CompanyScopeOption } from "@/features/companies/server/company-scope-options.queries";
import { COMPANY_SCOPE_ALL } from "@/features/shell/lib/company-scope-cookie";

type CompanyScopeContextValue = {
  tenantId: string;
  companies: CompanyScopeOption[];
  initialSelectedId: string;
  showFilter: boolean;
};

const CompanyScopeContext = createContext<CompanyScopeContextValue | null>(null);

export function CompanyScopeProvider({
  tenantId,
  companies,
  initialSelectedId,
  children,
}: {
  tenantId: string;
  companies: CompanyScopeOption[];
  initialSelectedId: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      tenantId,
      companies,
      initialSelectedId,
      showFilter: companies.length > 1,
    }),
    [tenantId, companies, initialSelectedId],
  );

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScopeOptions(): CompanyScopeContextValue {
  const ctx = useContext(CompanyScopeContext);
  if (!ctx) {
    return {
      tenantId: "",
      companies: [],
      initialSelectedId: COMPANY_SCOPE_ALL,
      showFilter: false,
    };
  }
  return ctx;
}
