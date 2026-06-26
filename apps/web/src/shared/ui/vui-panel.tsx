import type { ReactNode } from "react";

type VuiPanelProps = {
  children: ReactNode;
  className?: string;
};

/** Light ERP card — white background, compact border. */
export function VuiPanel({ children, className = "" }: VuiPanelProps) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}
