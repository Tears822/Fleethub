"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const ROUTE_TRANSITION_TIMEOUT_MS = 12_000;

/** Dispatched before shell navigation so heavy views (e.g. shift detail) can tear down. */
export const SHELL_ROUTE_TRANSITION_EVENT = "fleethub:shell-route-transition";

/** Track shell navigation with pending UI — clears when pathname commits or times out. */
export function useShellRouteTransition() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const targetHrefRef = useRef<string | null>(null);

  useEffect(() => {
    targetHrefRef.current = null;
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => {
      targetHrefRef.current = null;
      setPending(false);
      router.refresh();
    }, ROUTE_TRANSITION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [pending, pathname, router]);

  const beginRouteTransition = useCallback(
    (href: string) => {
      if (href === pathname || pathname.startsWith(`${href}/`)) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      targetHrefRef.current = href;
      setPending(true);
      window.dispatchEvent(
        new CustomEvent(SHELL_ROUTE_TRANSITION_EVENT, { detail: { href } }),
      );
    },
    [pathname],
  );

  return { pending, beginRouteTransition };
}
