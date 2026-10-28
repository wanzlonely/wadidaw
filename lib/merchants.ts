export type MerchantDef = {
  id: string;
  name: string;
  packages: string[];
  description: string;
};

/** Catalog mirrored from QRIS Hook + DANA focus */
export const MERCHANTS: MerchantDef[] = [
  {
    id: "dana",
    name: "DANA Bisnis",
    packages: ["id.dana", "id.dana.kasir"],
    description: "Notifikasi DANA / DANA Kasir (via app listener di HP)",
  },
  {
    id: "gopay",
    name: "GoPay Merchant",
    packages: ["com.gojek.gopaymerchant"],
    description: "GoPay Merchant app",
  },
  {
    id: "bri",
    name: "BRI Merchant",
    packages: ["id.co.bri.merchant"],
    description: "BRI Merchant",
  },
  {
    id: "interactive",
    name: "InterActive QRIS",
    packages: ["com.interactive.qrisid"],
    description: "InterActive QRIS",
  },
];
