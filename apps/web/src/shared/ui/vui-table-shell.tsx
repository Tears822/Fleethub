import type { ReactNode } from "react";

type VuiTableShellProps = {
  children: ReactNode;
  className?: string;
};

/** Wraps `<table>` — light ERP: border only, no heavy drop shadow. */
export function VuiTableShell({ children, className = "" }: VuiTableShellProps) {
  return (
    <div className={`overflow-hidden rounded-lg border border-zinc-200 bg-white ${className}`}>
      {children}
    </div>
  );
}
