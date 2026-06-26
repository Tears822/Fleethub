import path from "node:path";
import { config } from "dotenv";
import { buildUberDriverAuthorizeUrl, uberDriverEnv } from "../lib/uber-driver-env.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const url = buildUberDriverAuthorizeUrl();
const env = uberDriverEnv();

if (!url) {
  console.error("Set UBER_CLIENT_ID (or UBER_DRIVER_CLIENT_ID) and UBER_DRIVER_REDIRECT_URI in .env");
  process.exit(1);
}

console.log("Driver OAuth authorize URL (open as the Uber driver account):\n");
console.log(url);
console.log("\nScopes:", env.scope);
console.log("\nAfter redirect, set UBER_DRIVER_AUTH_CODE and run npm run test:uber-driver");
