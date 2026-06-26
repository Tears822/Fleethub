import {
  appsPlatformDisplayName,
  appsPlatformLogoId,
  type AppsPlatformSlug,
} from "@/features/apps/lib/apps-platform";
import { PlatformLogo } from "@/shared/ui/platform-logo";

export function AppsPlatformTab({ slug }: { slug: AppsPlatformSlug }) {
  return (
    <span className="inline-flex items-center gap-2">
      <PlatformLogo id={appsPlatformLogoId(slug)} size="sm" />
      <span>{appsPlatformDisplayName(slug)}</span>
    </span>
  );
}
