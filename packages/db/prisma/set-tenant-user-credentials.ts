/**
 * One-off: set tenant user password + mark email verified (skip invite flow).
 * Usage: npx tsx packages/db/prisma/set-tenant-user-credentials.ts <email> <password>
 */
import { config } from "dotenv";
import path from "node:path";
import { compare, hashSync } from "bcryptjs";
import { AuthSubjectType, AuthTokenType, PrismaClient } from "@prisma/client";

config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: npx tsx packages/db/prisma/set-tenant-user-credentials.ts <email> <password>");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, tenantId: true, tenant: { select: { slug: true } } },
  });

  if (!user) {
    console.error(`No tenant user found for ${email}`);
    process.exit(1);
  }

  const passwordHash = hashSync(password, 12);
  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      emailVerifiedAt: now,
      isActive: true,
      totpEnabled: false,
      totpSecret: null,
      totpBackupHashes: null,
    },
  });

  const consumed = await prisma.authToken.updateMany({
    where: {
      subjectType: AuthSubjectType.USER,
      subjectId: user.id,
      type: AuthTokenType.USER_INVITE,
      consumedAt: null,
    },
    data: { consumedAt: now },
  });

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, emailVerifiedAt: true },
  });

  const passwordOk = row ? await compare(password, row.passwordHash) : false;

  console.log(
    JSON.stringify(
      {
        email: user.email,
        tenantSlug: user.tenant.slug,
        passwordOk,
        emailVerified: row?.emailVerifiedAt != null,
        invitesConsumed: consumed.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
