export type MerchantDef = {
  id: string;
  name: string;
  packages: string[];
  description: string;
  builtInQrisHook?: boolean;
};

export const MERCHANTS: MerchantDef[] = [
  {
    id: "dana",
    name: "DANA",
    packages: ["id.dana", "id.dana.kasir"],
    description: "DANA / DANA Kasir",
    builtInQrisHook: false,
  },
  {
    id: "gopay",
    name: "GoPay Merchant",
    packages: ["com.gojek.gopaymerchant", "com.gojek.app"],
    description: "GoPay / Gojek",
    builtInQrisHook: true,
  },
  {
    id: "ovo",
    name: "OVO",
    packages: ["ovo.id", "id.ovo.merchant"],
    description: "OVO",
    builtInQrisHook: false,
  },
  {
    id: "shopeepay",
    name: "ShopeePay",
    packages: ["com.shopee.id", "com.beeasy.topup"],
    description: "ShopeePay",
    builtInQrisHook: false,
  },
  {
    id: "bri",
    name: "BRI Merchant",
    packages: ["id.co.bri.merchant"],
    description: "BRI Merchant",
    builtInQrisHook: true,
  },
  {
    id: "interactive",
    name: "InterActive QRIS",
    packages: ["com.interactive.qrisid"],
    description: "InterActive QRIS",
    builtInQrisHook: true,
  },
];
