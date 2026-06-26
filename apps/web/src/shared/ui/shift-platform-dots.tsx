import {
  appsPlatformDisplayName,
  appsPlatformLogoId,
  type AppsPlatformSlug,
} from "@/features/apps/lib/apps-platform";
import { PlatformLogo } from "@/shared/ui/platform-logo";

/** Platform logos for shift tables (any RidePlatform present in the row). */
export function ShiftPlatformDots({ slugs }: { slugs: AppsPlatformSlug[] }) {
  if (slugs.length === 0) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      {slugs.map((slug) => (
        <span key={slug} title={appsPlatformDisplayName(slug)}>
          <PlatformLogo id={appsPlatformLogoId(slug)} size="md" />
        </span>
      ))}
    </div>
  );
}
