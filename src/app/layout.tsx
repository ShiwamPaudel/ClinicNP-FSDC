import type { Metadata, Viewport } from "next";
import { getModules } from "@/lib/modules";
import {
  appNameFor,
  appDescriptionFor,
  appSubtitleFor,
} from "@/lib/app-name";
import {
  Bricolage_Grotesque,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Mukta,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { UpdateRecovery } from "@/components/app/update-recovery";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display-src",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-src",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-src",
  display: "swap",
});

const deva = Mukta({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-deva-src",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  // The product name follows the enabled modules (D-025), so the browser title
  // and the install prompt follow them too.
  const modules = await getModules();
  const appName = appNameFor(modules);
  return {
    title: {
      default: `${appName} — ${appSubtitleFor(modules)}`,
      template: `%s · ${appName}`,
    },
    applicationName: appName,
    description: appDescriptionFor(modules),
    manifest: "/manifest.json",
    icons: {
      icon: [
        { url: "/icons/favicon.png", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      // iOS composites a home-screen icon onto black, so it gets the filled
      // tile rather than the disc on transparency.
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#20342a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${deva.variable}`}
    >
      <body>
        <UpdateRecovery />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
