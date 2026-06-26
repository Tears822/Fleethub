/**
 * Reset tenant admin password (no 2FA). Owner DB role required.
 *
 *   node --import tsx scripts/reset-tenant-admin-password.ts cosculluela educosculluela@gmail.com
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../packages/auth/src/password-policy.ts";
import { prisma, withoutTenant } from "@fleethub/db";

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const email = process.argv[3]?.trim().toLowerCase();
  if (!tenantSlug || !email) {
    console.error("Usage: reset-tenant-admin-password.ts <tenant-slug> <email>");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const user = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { tenantId: tenant.id, email },
      select: { id: true, email: true },
    }),
  );
  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }

  const password = randomBytes(12).toString("base64url");
  await withoutTenant((tx) =>
    tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        totpEnabled: false,
        totpSecret: null,
        totpBackupHashes: null,
        emailVerifiedAt: new Date(),
        isActive: true,
      },
    }),
  );

  console.log("Tenant:", tenant.slug);
  console.log("Email:", user.email);
  console.log("Password:", password);
  console.log("2FA: disabled");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
