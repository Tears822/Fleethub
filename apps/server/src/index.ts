import "./load-env.js";
import cors from "@fastify/cors";
import Fastify from "fastify";
import secureJsonParse from "secure-json-parse";
import { registerTenantWriteGuard } from "./plugins/tenant-write-guard.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerSuperAdminRoutes } from "./routes/super-admin-routes.js";
import { registerTenantExportRoutes } from "./routes/tenant-export-routes.js";
import { registerTenantCompaniesRoutes } from "./routes/tenant-companies-routes.js";
import { registerTenantUploadRoutes } from "./routes/tenant-upload-routes.js";
import { registerTenantOperativaRoutes } from "./routes/tenant-operativa-routes.js";
import { registerTenantNotificationsRoutes } from "./routes/tenant-notifications-routes.js";
import { registerTenantSettingsRoutes } from "./routes/tenant-settings-routes.js";
import { registerTenantSyncRoutes } from "./routes/tenant-sync-routes.js";
import { registerTenantLiveRoutes } from "./routes/tenant-live-routes.js";
import { registerTenantUsersRoutes } from "./routes/tenant-users-routes.js";
import { registerWebhookRoutes } from "./routes/webhook-routes.js";

const PORT = Number(process.env.PORT ?? "4000");
const WEB_ORIGIN = process.env.WEB_ORIGIN?.trim();

const app = Fastify({ logger: true });

// Fastify rejects `Content-Type: application/json` with an empty body (400). Proxies and some
// clients send that combination on POST; treat it like `{}` so `/api/auth/logout` still works.
// Webhook POSTs keep raw bytes on `req.rawBody` for HMAC verification (Uber X-Uber-Signature).
app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  const raw = typeof body === "string" ? body : String(body ?? "");
  const path = req.url.split("?")[0] ?? "";
  if (
    req.method === "POST" &&
    (path === "/api/webhooks/uber" || path === "/api/webhooks/freenow")
  ) {
    (req as { rawBody?: Buffer }).rawBody = Buffer.from(raw, "utf8");
  }
  if (raw.length === 0) {
    done(null, {});
    return;
  }
  try {
    done(
      null,
      secureJsonParse(raw, { protoAction: "error", constructorAction: "error" })
    );
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(cors, {
  origin: WEB_ORIGIN ? WEB_ORIGIN.split(",").map((s) => s.trim()) : true,
  credentials: true,
});

await registerWebhookRoutes(app);
await registerTenantWriteGuard(app);
await registerAuthRoutes(app);
await registerSuperAdminRoutes(app);
await registerTenantUsersRoutes(app);
await registerTenantCompaniesRoutes(app);
await registerTenantUploadRoutes(app);
await registerTenantOperativaRoutes(app);
await registerTenantSettingsRoutes(app);
await registerTenantSyncRoutes(app);
await registerTenantLiveRoutes(app);
await registerTenantNotificationsRoutes(app);
await registerTenantExportRoutes(app);

app.get("/health", async () => ({ ok: true, service: "fleethub-api" }));

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`FleetHub API on http://127.0.0.1:${PORT} (WEB_ORIGIN=${WEB_ORIGIN ?? "*"})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
