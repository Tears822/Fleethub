/**
 * Resetea 2FA del Super Admin con un secreto TOTP nuevo (dev/demo).
 * Uso: npx tsx prisma/reset-superadmin-2fa.ts [email]
 */
import { randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";
import { authenticator } from "otplib";
import { PrismaClient } from "@prisma/client";

authenticator.options = { window: 1 };

const prisma = new PrismaClient();

function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = randomBytes(3).toString("hex").toUpperCase();
    codes.push(`${part.slice(0, 4)}-${part.slice(4, 8)}`);
  }
  return codes;
}

function hashBackupCodes(codes: string[]): string[] {
  return codes.map((c) => hashSync(c.replace(/\s/g, ""), 10));
}

async function main() {
  const emailArg = process.argv[2]?.trim().toLowerCase();
  const user = emailArg
    ? await prisma.platformUser.findUnique({ where: { email: emailArg } })
    : await prisma.platformUser.findFirst({
        where: { role: "SUPER_ADMIN", isActive: true },
        orderBy: { email: "asc" },
      });

  if (!user) {
    console.error(
      emailArg
        ? `No hay platform user con email ${emailArg}`
        : "No hay Super Admin activo en platform_users",
    );
    process.exit(1);
  }

  const secret = authenticator.generateSecret();
  const backupCodes = generateBackupCodes();
  const uri = authenticator.keyuri(user.email, "FleetHub", secret);
  const currentCode = authenticator.generate(secret);

  await prisma.platformUser.update({
    where: { id: user.id },
    data: {
      totpSecret: secret,
      totpEnabled: true,
      totpBackupHashes: hashBackupCodes(backupCodes),
    },
  });

  console.log(`
Super Admin 2FA actualizado

  Cuenta:     ${user.email}
  Nombre:     ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}

  Secreto TOTP (manual):
  ${secret}

  URI (Google Authenticator / Authy — escanear QR generado desde esta URI):
  ${uri}

  Código actual (válido ~30 s):
  ${currentCode}

  Códigos de respaldo (un solo uso cada uno):
${backupCodes.map((c) => `  - ${c}`).join("\n")}

Login:
  1. Tenant slug: platform
  2. Email + contraseña (seed: Demo1234! si no la cambiaste)
  3. Código 2FA de la app o un código de respaldo
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
