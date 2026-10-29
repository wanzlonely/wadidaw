export type MerchantDef = {
  id: string;
  name: string;
  packages: string[];
  description: string;
};

/** Aplikasi di HP yang bisa dikirim notifikasi pembayaran */
export const MERCHANTS: MerchantDef[] = [
  {
    id: "dana",
    name: "DANA",
    packages: ["id.dana", "id.dana.kasir"],
    description: "DANA & DANA Kasir",
  },
  {
    id: "gopay",
    name: "GoPay",
    packages: ["com.gojek.gopaymerchant", "com.gojek.app"],
    description: "GoPay / Gojek",
  },
  {
    id: "ovo",
    name: "OVO",
    packages: ["ovo.id", "id.ovo.merchant"],
    description: "OVO",
  },
  {
    id: "shopeepay",
    name: "ShopeePay",
    packages: ["com.shopee.id"],
    description: "ShopeePay",
  },
  {
    id: "linkaja",
    name: "LinkAja",
    packages: ["com.telkom.mwallet"],
    description: "LinkAja",
  },
  {
    id: "bca",
    name: "BCA Mobile",
    packages: ["com.bca"],
    description: "BCA mobile banking",
  },
  {
    id: "bri",
    name: "BRImo / BRI Merchant",
    packages: ["id.co.bri.brimo", "id.co.bri.merchant"],
    description: "BRI",
  },
  {
    id: "mandiri",
    name: "Livin Mandiri",
    packages: ["id.bmri.livin"],
    description: "Bank Mandiri",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    packages: ["com.whatsapp", "com.whatsapp.w4b"],
    description: "Bukti transfer / chat WA",
  },
  {
    id: "sms",
    name: "SMS / Messages",
    packages: ["com.google.android.apps.messaging", "com.android.mms"],
    description: "SMS bank / notifikasi",
  },
];

export function packagesForIds(ids: string[]): string[] {
  const set = new Set<string>();
  for (const m of MERCHANTS) {
    if (ids.includes(m.id)) {
      for (const p of m.packages) set.add(p);
    }
  }
  return Array.from(set);
}
