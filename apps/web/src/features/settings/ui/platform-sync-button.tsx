"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  requestPlatformSyncPoll,
  type PlatformSyncPollOptions,
} from "@/features/integrations/lib/request-platform-sync";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export function PlatformSyncButton({
  options = {},
  label,
  className = "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50",
  onStarted,
}: {
  options?: PlatformSyncPollOptions;
  label?: string;
  className?: string;
  onStarted?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const [loading, setLoading] = useState(false);
  const buttonLabel = label ?? t("config.integrations.sync");

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestPlatformSyncPoll(options);
      router.refresh();
      if (result.ok) {
        onStarted?.();
        toast.success(result.message ?? t("config.integrations.syncQueued"));
        return;
      }
      if (result.status === 503 && result.queueUnavailable) {
        toast.info(t("config.integrations.syncQueueUnavailable"));
        return;
      }
      toast.error(result.error ?? t("config.integrations.syncEnqueueError"));
    } catch {
      router.refresh();
      toast.error(t("shell.serverError"));
    } finally {
      setLoading(false);
    }
  }, [onStarted, options, router, t, toast]);

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => void handleClick()}
    >
      <span className="inline-flex items-center gap-1">
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
        {loading ? "…" : buttonLabel}
      </span>
    </button>
  );
}
