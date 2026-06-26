import type { NextConfig } from "next";

/**
 * FleetHub API (`@fleethub/server`) — must match `NEXT_PUBLIC_SERVER_URL` in `public-env.ts`
 * (same env var; duplicated here because `next.config` cannot import app `src/`).
 */
function fleetHubServerUrlFromEnv(): string {
  const key = "NEXT_PUBLIC_SERVER_URL";
  const raw = process.env[key]?.trim().replace(/\/+$/, "");
  if (!raw) {
    throw new Error(
      `${key} is required (e.g. http://127.0.0.1:4000). ` +
        "Next rewrites /api/* to this origin. Run `npm run dev` from the monorepo root. See apps/web/.env.example."
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      const serverHost = new URL(raw).hostname;
      const appHost = new URL(appUrl).hostname;
      if (
        serverHost === appHost ||
        (serverHost.startsWith("api.") && serverHost.slice(4) === appHost)
      ) {
        throw new Error(
          `${key} must be the internal FleetHub API (e.g. http://127.0.0.1:4000), not the public ` +
            `site or api subdomain (${raw}). The browser already calls same-origin /api/* on ${appUrl}; ` +
            "pointing rewrites at the public hostname loops through nginx and breaks login (431)."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("must be the internal")) {
        throw err;
      }
    }
  }
  return raw;
}

const apiServerBase = fleetHubServerUrlFromEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@fleethub/db", "@fleethub/contracts", "@fleethub/auth"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiServerBase}/api/:path*` }];
  },
};

export default nextConfig;
