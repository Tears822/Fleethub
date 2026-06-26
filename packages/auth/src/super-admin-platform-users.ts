import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { PlatformRole, prisma, writeAuditLog } from "@fleethub/db";
import { emailConflictMessage, findEmailAccountConflict } from "./email-uniqueness";
import { hashPassword, validatePasswordStrength } from "./password-policy";
import type { AppSession } from "./types";

type CreatePlatformUserBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
};

export async function createPlatformUser(
  session: AppSession,
  body: unknown,
): Promise<Result<{ userId: string }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const b = body as CreatePlatformUserBody;
  const email = b.email?.trim().toLowerCase() ?? "";
  const password = b.password ?? "";
  const firstName = b.firstName?.trim() ?? "";
  const lastName = b.lastName?.trim() ?? "";

  if (!email) return err({ message: "El email es obligatorio." });

  const policyErr = validatePasswordStrength(password);
  if (policyErr) return err({ message: policyErr });

  const emailConflict = await findEmailAccountConflict(email);
  if (emailConflict) {
    return err({ message: emailConflictMessage(emailConflict) });
  }

  const user = await prisma.platformUser.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role: PlatformRole.SUPER_ADMIN,
      firstName: firstName || null,
      lastName: lastName || null,
      isActive: b.isActive !== false,
      emailVerifiedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorUserId: session.sub,
    action: "platform_user.create",
    entityType: "platform_user",
    entityId: user.id,
    payload: { email },
  });

  return ok({ userId: user.id });
}
