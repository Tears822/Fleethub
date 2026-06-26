import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import {
  isTenantRouteAllowed,
  redirectPathForRestriction,
  getTenantRouteRestriction,
} from "@/domain/rbac.policy";
import { readOptionalAuthSecretBytes } from "@/shared/auth/secret";
import { FH_SESSION_COOKIE } from "@/shared/constants/cookies";

export async function middleware(request: NextRequest) {
  const key = readOptionalAuthSecretBytes();
  if (!key) {
    return NextResponse.next();
  }

  const token = request.cookies.get(FH_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, key);
    const kind = payload.kind;
    const pathname = request.nextUrl.pathname;

    if (kind === "platform" && !pathname.startsWith("/super-admin")) {
      return NextResponse.redirect(new URL("/super-admin", request.url));
    }

    if (kind === "tenant") {
      const role = typeof payload.role === "string" ? payload.role : "";
      if (!isTenantRouteAllowed(role, pathname)) {
        const restriction = getTenantRouteRestriction(pathname);
        const target = restriction ? redirectPathForRestriction(restriction) : "/dashboard";
        return NextResponse.redirect(new URL(target, request.url));
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

/** Static matcher only — Next.js build rejects spread/dynamic arrays here. */
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/conductores",
    "/conductores/:path*",
    "/empresas",
    "/empresas/:path*",
    "/configuracion",
    "/configuracion/:path*",
    "/ajustes",
    "/ajustes/:path*",
    "/apps",
    "/apps/:path*",
    "/cerrar-turnos",
    "/cerrar-turnos/:path*",
    "/turnos-cerrados",
    "/turnos-cerrados/:path*",
    "/facturacion",
    "/facturacion/:path*",
    "/analitica",
    "/analitica/:path*",
    "/super-admin",
    "/super-admin/:path*",
  ],
};
