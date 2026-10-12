import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Meme’d — get paid when your posts hit milestones", template: "%s · Meme’d" },
  description:
    "Meme’d connects brands with meme pages and clip creators. Brands set a budget and view milestones; creators earn the payout for the highest milestone their post reaches.",
  applicationName: "Meme’d",
  openGraph: {
    type: "website",
    siteName: "Meme’d",
    title: "Meme’d — milestone payouts for creator campaigns",
    description: "Transparent, budget-capped payouts for meme and clip campaigns on Instagram and YouTube.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#17123a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
