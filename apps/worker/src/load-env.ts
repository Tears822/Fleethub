import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Must run before any import that touches `@fleethub/db` (Prisma reads DATABASE_URL at init).
const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const repoRoot = path.resolve(workerRoot, "..", "..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(workerRoot, ".env"), override: true });
