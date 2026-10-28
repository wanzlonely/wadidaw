/**
 * Server-side parser for payloads from phone notification listeners
 * (QRIS Hook / custom). Prioritizes structured fields, then regex on text.
 */

export type ParsedPaymentInput = {
  merchantId?: string;
  merchant?: string;
  amount?: number | string;
  nominal?: number | string;
  paymentSource?: string;
  source?: string;
  senderName?: string;
  rawTitle?: string;
  title?: string;
  rawText?: string;
  text?: string;
  bigText?: string;
  packageName?: string;
  package?: string;
};

export type ParsedPayment = {
  merchantId: string;
  amount: number;
  paymentSource: string | null;
  senderName: string | null;
  rawTitle: string | null;
  rawText: string | null;
  packageName: string | null;
};

const PACKAGE_TO_MERCHANT: Record<string, string> = {
  "id.dana": "dana",
  "id.dana.kasir": "dana",
  "com.gojek.gopaymerchant": "gopay",
  "id.co.bri.merchant": "bri",
  "com.interactive.qrisid": "interactive",
};

const IGNORE = [
  "gagal",
  "batal",
  "refund",
  "promo",
  "kaget",
  "voucher",
  "tarik tunai",
  "penarikan",
  "transfer keluar",
  "pembayaran gagal",
];

const SUCCESS_HINTS = [
  "berhasil",
  "sukses",
  "diterima",
  "uang masuk",
  "saldo masuk",
  "pembayaran",
  "qris",
  "terima",
  "masuk",
  "purchase",
  "paid",
];

/** Extract IDR amount: Rp10.000 / Rp 10000 / 10.000 / 10000 */
export function extractAmount(text: string): number | null {
  if (!text) return null;

  // Prefer Rp… patterns
  const rp =
    text.match(/rp\.?\s*([\d]{1,3}(?:[.\s]?\d{3})*(?:,\d+)?)/i) ||
    text.match(/rp\.?\s*([\d]+)/i);
  if (rp) {
    const n = normalizeDigits(rp[1]);
    if (n != null && n > 0) return n;
  }

  // Standalone thousands: 10.000 or 10.000,00
  const bare = text.match(/\b([\d]{1,3}(?:\.\d{3})+)(?:,\d+)?\b/);
  if (bare) {
    const n = normalizeDigits(bare[1]);
    if (n != null && n > 0) return n;
  }

  return null;
}

function normalizeDigits(raw: string): number | null {
  // Indonesian: dot = thousands, comma = decimal → drop decimals
  let s = raw.replace(/\s/g, "");
  if (s.includes(",")) s = s.split(",")[0];
  s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function resolveMerchant(
  body: ParsedPaymentInput,
  packageName: string | null,
  blob: string
): string {
  const explicit = (body.merchantId || body.merchant || "").toLowerCase().trim();
  if (explicit) return explicit;

  if (packageName && PACKAGE_TO_MERCHANT[packageName]) {
    return PACKAGE_TO_MERCHANT[packageName];
  }

  if (/dana/i.test(blob)) return "dana";
  if (/gopay|gojek/i.test(blob)) return "gopay";
  if (/\bbri\b/i.test(blob)) return "bri";
  if (/interactive/i.test(blob)) return "interactive";

  return "unknown";
}

export function parsePaymentBody(
  body: ParsedPaymentInput
): { ok: true; data: ParsedPayment } | { ok: false; error: string } {
  const title = String(body.rawTitle ?? body.title ?? "");
  const text = String(body.rawText ?? body.text ?? "");
  const big = String(body.bigText ?? "");
  const blob = `${title} ${text} ${big}`.toLowerCase();

  const packageName = String(body.packageName ?? body.package ?? "") || null;

  // Soft filter: if clearly failure promo, reject when no structured amount
  const hasIgnore = IGNORE.some((k) => blob.includes(k));
  const hasSuccess = SUCCESS_HINTS.some((k) => blob.includes(k));

  let amount: number | null = null;

  if (typeof body.amount === "number" && body.amount > 0) amount = body.amount;
  else if (typeof body.amount === "string") amount = extractAmount(body.amount) ?? extractAmount(`Rp${body.amount}`);
  else if (typeof body.nominal === "number" && body.nominal > 0)
    amount = body.nominal;
  else if (typeof body.nominal === "string")
    amount = extractAmount(body.nominal) ?? extractAmount(`Rp${body.nominal}`);

  if (amount == null) amount = extractAmount(`${title} ${text} ${big}`);

  if (amount == null || amount <= 0) {
    return { ok: false, error: "amount not found or invalid" };
  }

  // If text looks like failure and no strong success, reject
  if (hasIgnore && !hasSuccess && body.amount == null && body.nominal == null) {
    return { ok: false, error: "ignored non-success notification" };
  }

  const merchantId = resolveMerchant(body, packageName, blob);

  return {
    ok: true,
    data: {
      merchantId,
      amount,
      paymentSource:
        body.paymentSource != null
          ? String(body.paymentSource)
          : body.source != null
            ? String(body.source)
            : merchantId === "dana"
              ? "DANA"
              : null,
      senderName: body.senderName != null ? String(body.senderName) : null,
      rawTitle: title || null,
      rawText: text || big || null,
      packageName,
    },
  };
}
