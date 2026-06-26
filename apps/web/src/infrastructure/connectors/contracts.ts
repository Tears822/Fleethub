/**
 * Re-exports integration contracts for the web app (Hito 3 implementations register here).
 * UI and routes should not import `@fleethub/contracts` directly unless they are integration code.
 */
export type { FleetConnector, RidePlatformCode } from "@fleethub/contracts";
