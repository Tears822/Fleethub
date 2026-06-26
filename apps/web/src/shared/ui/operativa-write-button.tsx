"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTenantPermissions } from "@/features/auth/ui/tenant-permissions-context";

type OperativaWriteKind = "shifts" | "drivers";

type OperativaWriteButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: OperativaWriteKind;
  children: ReactNode;
};

export function OperativaWriteButton({
  kind,
  children,
  className = "",
  disabled,
  title,
  ...rest
}: OperativaWriteButtonProps) {
  const perms = useTenantPermissions();
  const allowed = kind === "shifts" ? perms.canManageShifts : perms.canManageDrivers;

  if (!allowed) {
    return null;
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      {...rest}
    >
      {children}
    </button>
  );
}
