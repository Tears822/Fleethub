import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { prisma, withTenant, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";

export const ALLOWED_USER_LOCALES = new Set(["es", "ca", "en"]);

export function parseUserLocaleInput(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!ALLOWED_USER_LOCALES.has(raw)) return null;
  return raw;
}

export async function getLocaleForSession(session: AppSession): Promise<string> {
  if (session.kind === "platform") {
    return "es";
  }

  if (!session.tid) {
    return "es";
  }

  if (session.impersonating) {
    return "es";
  }

  const user = await withTenant(session.tid, (tx) =>
    tx.user.findFirst({
      where: { id: session.sub },
      select: { locale: true },
    }),
  );

  return user?.locale ?? "es";
}

export async function updateAccountLocale(
  session: AppSession,
  body: unknown,
): Promise<Result<{ locale: string }, { message: string }>> {
  const localeRaw =
    typeof body === "object" && body !== null && "locale" in body
      ? String((body as { locale: string }).locale)
      : "";
  const locale = parseUserLocaleInput(localeRaw);
  if (!locale) {
    return err({ message: "Idioma no válido." });
  }

  if (session.kind === "platform") {
    return err({ message: "No autorizado." });
  }

  if (!session.tid) {
    return err({ message: "No autorizado." });
  }

  if (session.impersonating) {
    return err({ message: "No puedes cambiar el idioma en modo solo lectura." });
  }

  return withTenant(session.tid, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id: session.sub },
      select: { id: true },
    });
    if (!existing) return err({ message: "No autorizado." });

    const user = await tx.user.update({
      where: { id: session.sub },
      data: { locale },
      select: { locale: true },
    });

    await writeAuditLog({
      tenantId: session.tid,
      actorUserId: session.sub,
      action: "user.locale.update",
      entityType: "user",
      entityId: session.sub,
      payload: { locale: user.locale },
    });

    return ok({ locale: user.locale });
  });
}
