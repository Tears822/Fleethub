import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getPublicAppUrl } from "@/shared/config/public-env";
import { resolveAppLocale } from "@/shared/i18n/resolve-app-locale.server";
import { AppProviders } from "@/shared/ui/app-providers";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppUrl()),
  title: {
    default: "FleetHub",
    template: "%s · FleetHub",
  },
  description: "Gestión de flotas VTC",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", sizes: "180x180" }],
  },
};

/** Lets `env(safe-area-inset-*)` resolve on iOS / notched devices when using full-bleed layouts. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveAppLocale();
  return (
    <html lang={locale === "ca" ? "ca" : "es"} className={plusJakarta.variable}>
      <body
        className={`${plusJakarta.className} min-h-screen bg-zinc-100 text-zinc-800 antialiased`}
      >
        <AppProviders locale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
