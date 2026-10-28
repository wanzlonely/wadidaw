import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WALZPAY — QRIS Webhook Dashboard",
  description: "Dashboard notifikasi QRIS ke webhook · liquid glass",
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
