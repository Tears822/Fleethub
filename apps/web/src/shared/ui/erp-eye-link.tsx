import Link from "next/link";
import { Eye } from "lucide-react";

type ErpEyeLinkProps = {
  href: string;
  label?: string;
  className?: string;
};

/** Compact eye + label link for table actions (conductores, turnos, etc.). */
export function ErpEyeLink({ href, label = "Ver", className = "" }: ErpEyeLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={[
        "erp-btn-edit inline-flex min-h-[2.35rem] min-w-[2.6rem] flex-col items-center justify-center gap-0.5 px-2 py-1.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="text-[9px] font-semibold leading-none">{label}</span>
    </Link>
  );
}
