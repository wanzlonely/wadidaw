import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WALZPAY — QRIS Webhook Dashboard",
  description:
    "Dashboard notifikasi QRIS ke webhook · liquid glass · siap PWA",
  applicationName: "WALZPAY",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WALZPAY",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1628",
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
      <body>{children}</body>
    </html>
  );
}
