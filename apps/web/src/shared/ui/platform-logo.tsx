import { Check } from "lucide-react";

export type PlatformLogoId = "uber" | "freenow" | "bolt" | "cabify";

const SIZE = {
  sm: {
    uber: "h-5 min-w-[2.1rem] rounded px-1 text-[7px] font-bold leading-none",
    fn: "h-5 w-5 rounded",
    icon: "h-3 w-3 stroke-[3]",
  },
  md: {
    uber: "h-7 min-w-[2.75rem] rounded-md px-1.5 text-[9px] font-bold leading-none",
    fn: "h-7 w-7 rounded-md",
    icon: "h-3.5 w-3.5 stroke-[3]",
  },
  lg: {
    uber: "h-9 min-w-[3.25rem] rounded-lg px-2 text-[11px] font-bold leading-none",
    fn: "h-9 w-9 rounded-lg",
    icon: "h-4 w-4 stroke-[3]",
  },
} as const;

type Size = keyof typeof SIZE;

export function PlatformLogo({
  id,
  size = "md",
  className = "",
}: {
  id: PlatformLogoId;
  size?: Size;
  className?: string;
}) {
  const s = SIZE[size];

  if (id === "uber") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-zinc-900 text-white ${s.uber} ${className}`}
        aria-hidden
      >
        Uber
      </span>
    );
  }

  if (id === "freenow") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-red-600 text-white ${s.fn} ${className}`}
        aria-hidden
      >
        <Check className={s.icon} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 font-bold uppercase text-zinc-500 ${s.fn} ${className}`}
      aria-hidden
    >
      {id === "bolt" ? "B" : "C"}
    </span>
  );
}

/** Tab / pill label with platform mark + name (liquidaciones, Apps, etc.). */
export function PlatformTabLabel({
  platform,
}: {
  platform: "uber" | "freenow";
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <PlatformLogo id={platform} size="sm" />
      <span>{platform === "uber" ? "Uber" : "FreeNow"}</span>
    </span>
  );
}
