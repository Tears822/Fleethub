import type { ReactNode } from "react";
import type { PlatformLogoId } from "@/shared/lib/ride-platform-logos";
import { PlatformLogo } from "@/shared/ui/platform-logo";

const LOGO_TITLES: Record<PlatformLogoId, string> = {
  uber: "Uber",
  freenow: "FreeNow",
  bolt: "Bolt",
  cabify: "Cabify",
};

function variantToLogoIds(variant: "uber" | "freenow" | "both" | "uber-only"): PlatformLogoId[] {
  if (variant === "both") return ["uber", "freenow"];
  if (variant === "uber-only" || variant === "uber") return ["uber"];
  return ["freenow"];
}

/** Platform markers for tables and shift breakdown. Prefer `platforms` when Bolt/Cabify apply. */
export function MockPlatformDots({
  variant,
  platforms,
}: {
  variant?: "uber" | "freenow" | "both" | "uber-only";
  platforms?: PlatformLogoId[];
}) {
  const ids = platforms ?? variantToLogoIds(variant ?? "both");
  if (ids.length === 0) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      {ids.map((id) => (
        <span key={id} title={LOGO_TITLES[id]}>
          <PlatformLogo id={id} size="md" />
        </span>
      ))}
    </div>
  );
}

export function MockDemoStrip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span className="font-semibold text-amber-800">Maquetación · </span>
      {children}
    </div>
  );
}
