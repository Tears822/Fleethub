import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isSmtpConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(user && pass);
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "noreply@fleethub.local";
  return { host, port, user, pass, from };
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { host, port, user, pass, from } = smtpConfig();
  if (!user || !pass) {
    console.warn("[fleethub/mail] SMTP_USER/SMTP_PASS not set — email not sent:", input.subject, "→", input.to);
    if (process.env.NODE_ENV !== "production") {
      console.warn("[fleethub/mail] Body:", input.text);
    }
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? input.text.replace(/\n/g, "<br>"),
  });
}

export function appPublicUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_PUBLIC_URL?.trim() ||
    "http://localhost:3000"
  );
}
