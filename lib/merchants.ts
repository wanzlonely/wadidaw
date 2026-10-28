export type MerchantDef = {
  id: string;
  name: string;
  packages: string[];
  description: string;
  builtInQrisHook?: boolean;
};

/**
 * Catalog for dashboard + server package mapping.
 * builtInQrisHook = ada di parser bawaan QRIS Hook (per release publik).
 * DANA / WhatsApp: WALZPAY bisa parse jika payload dikirim ke webhook
 * (via forwarder, custom listener, atau setelah parser merchant ditambah).
 */
export const MERCHANTS: MerchantDef[] = [
  {
    id: "dana",
    name: "DANA Bisnis",
    packages: ["id.dana", "id.dana.kasir"],
    description: "DANA / DANA Kasir — butuh listener yang forward notifikasi",
    builtInQrisHook: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    packages: ["com.whatsapp", "com.whatsapp.w4b"],
    description: "Uji notifikasi WA (transfer bank / bukti bayar)",
    builtInQrisHook: false,
  },
  {
    id: "gopay",
    name: "GoPay Merchant",
    packages: ["com.gojek.gopaymerchant"],
    description: "GoPay Merchant",
    builtInQrisHook: true,
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
