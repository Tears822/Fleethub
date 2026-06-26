import Link from "next/link";
import type { ReactNode } from "react";

export function SuperAdminPrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="sa-btn-primary">
      {children}
    </Link>
  );
}

export function SuperAdminOutlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="sa-btn-outline">
      {children}
    </Link>
  );
}
