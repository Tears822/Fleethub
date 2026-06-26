/** Edge-safe: only reads env — no Prisma/bcrypt (see `@fleethub/auth/secret` subpath). */
export { readOptionalAuthSecretBytes } from "@fleethub/auth/secret";
