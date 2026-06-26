/**
 * Verify SMTP credentials from fleethub/.env (connection + optional test send).
 * Usage: npx tsx scripts/test-smtp.ts [--send]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const port = Number(process.env.SMTP_PORT ?? "587");
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const from = process.env.SMTP_FROM?.trim() || user;
const send = process.argv.includes("--send");

function mask(s: string | undefined): string {
  if (!s) return "(missing)";
  if (s.length <= 4) return "****";
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

async function main() {
  if (!user || !pass) {
    console.error("SMTP_USER and SMTP_PASS must be set in fleethub/.env");
    process.exit(1);
  }

  console.log("SMTP config:", { host, port, user: mask(user), from: mask(from) });

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transport.verify();
    console.log("OK: SMTP connection verified");
  } catch (err) {
    console.error("FAIL: SMTP verify:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!send) {
    console.log("Tip: run with --send to deliver a test message to SMTP_USER");
    return;
  }

  const to = user;
  const info = await transport.sendMail({
    from: from ?? user,
    to,
    subject: "FleetHub SMTP test",
    text: `SMTP test at ${new Date().toISOString()}\nIf you received this, mail is working.`,
  });

  console.log("OK: test email sent", { messageId: info.messageId, to: mask(to) });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
