import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./extra.css";
import { AuthGuard } from "@/components/AuthGuard";
import { BubbleToasts } from "@/components/BubbleToasts";

export const metadata: Metadata = {
  title: "WALZPAY — Liquid Glass Dashboard",
  description: "QRIS webhook, pesanan auto-settle, Redis, PWA",
  applicationName: "WALZPAY",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WALZPAY",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <AuthGuard>
          {children}
          <BubbleToasts />
        </AuthGuard>
      </body>
    </html>
  );
}
