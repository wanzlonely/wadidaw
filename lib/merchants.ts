export type MerchantDef = {
  id: string;
  name: string;
  packages: string[];
  description: string;
  builtInQrisHook?: boolean;
};

/** Sumber notifikasi sesuai app di HP (termasuk WhatsApp bukti transfer nyata) */
export const MERCHANTS: MerchantDef[] = [
  {
    id: "dana",
    name: "DANA",
    packages: ["id.dana", "id.dana.kasir"],
    description: "DANA / DANA Kasir",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    packages: ["com.whatsapp", "com.whatsapp.w4b"],
    description: "Bukti transfer / notifikasi WA nyata dari HP",
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
    id: "bri",
    name: "BRI Merchant",
    packages: ["id.co.bri.merchant"],
    description: "BRI Merchant",
  },
];
