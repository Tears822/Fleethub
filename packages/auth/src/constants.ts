/** HttpOnly session cookie (JWT) — shared by Next middleware and API server. */
export const FH_SESSION_COOKIE = "fh_session" as const;

/** Platform session backup while SA impersonates a tenant (read-only). */
export const FH_PLATFORM_SESSION_COOKIE = "fh_platform_session" as const;
