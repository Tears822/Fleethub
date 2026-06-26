"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  canExportTenantData,
  canManageCompanies,
  canManageDrivers,
  canManageShifts,
  canManageTenantSettings,
  isReadOnly,
} from "@/domain/rbac.policy";

export type TenantPermissions = {
  role: string;
  isReadOnly: boolean;
  canManageShifts: boolean;
  canManageDrivers: boolean;
  canManageCompanies: boolean;
  canManageSettings: boolean;
  canExport: boolean;
};

const TenantPermissionsContext = createContext<TenantPermissions | null>(null);

export function TenantPermissionsProvider({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  const value = useMemo<TenantPermissions>(
    () => ({
      role,
      isReadOnly: isReadOnly(role),
      canManageShifts: canManageShifts(role),
      canManageDrivers: canManageDrivers(role),
      canManageCompanies: canManageCompanies(role),
      canManageSettings: canManageTenantSettings(role),
      canExport: canExportTenantData(role),
    }),
    [role],
  );

  return (
    <TenantPermissionsContext.Provider value={value}>{children}</TenantPermissionsContext.Provider>
  );
}

export function useTenantPermissions(): TenantPermissions {
  const ctx = useContext(TenantPermissionsContext);
  if (!ctx) {
    throw new Error("useTenantPermissions must be used within TenantPermissionsProvider");
  }
  return ctx;
}
