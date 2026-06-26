import Image from "next/image";

/** Public path — also referenced in `app/layout.tsx` metadata icons. */
export const BRAND_LOGO_PATH = "/logo.png" as const;

type BrandLogoProps = {
  /** Pixel width/height passed to `next/image`. */
  size: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ size, className, priority }: BrandLogoProps) {
  return (
    <Image
      src={BRAND_LOGO_PATH}
      alt="FleetHub"
      width={size}
      height={size}
      className={className}
      sizes={`${size}px`}
      priority={priority}
    />
  );
}
