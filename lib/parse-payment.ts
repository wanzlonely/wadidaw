/**
 * Parse webhook bodies from QRIS Hook, test buttons, or notification forwarders.
 * Supports nested QRIS Hook shape and flat { title, text, packageName }.
 */

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
  "com.whatsapp": "whatsapp",
  "com.whatsapp.w4b": "whatsapp",
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
  "pembayaran gagal",
  "otp",
  "kode verifikasi",
  "missed voice call",
  "missed video call",
];

const SUCCESS_HINTS = [
  "berhasil",
  "sukses",
  "diterima",
  "uang masuk",
  "saldo masuk",
  "pembayaran",
  "qris",
  "purchase",
  "paid",
  "masuk",
  "transfer",
  "kredit",
  "credit",
  "terima",
  "received",
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function extractAmount(text: string): number | null {
  if (!text) return null;
  const rp =
    text.match(/rp\.?\s*([\d]{1,3}(?:[.\s]?\d{3})*(?:,\d+)?)/i) ||
    text.match(/rp\.?\s*([\d]+)/i);
  if (rp) {
    const n = normalizeDigits(rp[1]);
    if (n != null && n > 0) return n;
  }
  const bare = text.match(/\b([\d]{1,3}(?:\.\d{3})+)(?:,\d+)?\b/);
  if (bare) {
    const n = normalizeDigits(bare[1]);
    if (n != null && n > 0) return n;
  }
  return null;
}

function normalizeDigits(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  if (s.includes(",")) s = s.split(",")[0];
  s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const fromText = extractAmount(v) ?? extractAmount(`Rp${v}`);
    if (fromText) return fromText;
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function extractSender(blob: string): string | null {
  const m =
    blob.match(/(?:dari|from|oleh)\s*[:\-]?\s*([A-Za-z0-9 .'+]{2,40})/i) ||
    blob.match(/a\/n\s*[:\-]?\s*([A-Za-z0-9 .'+]{2,40})/i);
  if (!m) return null;
  return m[1].trim().slice(0, 60);
}

export function parsePaymentBody(
  body: Record<string, unknown>
): { ok: true; data: ParsedPayment } | { ok: false; error: string } {
  const payment = asRecord(body.payment);
  const notification = asRecord(body.notification) ?? asRecord(body.raw);

  const title = String(
    body.rawTitle ?? body.title ?? notification?.title ?? ""
  );
  const text = String(
    body.rawText ??
      body.text ??
      notification?.text ??
      notification?.big_text ??
      body.bigText ??
      ""
  );
  const big = String(notification?.big_text ?? body.bigText ?? "");
  const combined = `${title} ${text} ${big}`;
  const blob = combined.toLowerCase();

  const packageName =
    String(
      body.packageName ??
        body.package ??
        body.source_package ??
        notification?.source_package ??
        ""
    ) || null;

  let amount =
    num(body.amount) ??
    num(body.nominal) ??
    num(payment?.amount) ??
    extractAmount(combined);

  if (amount == null || amount <= 0) {
    return { ok: false, error: "amount not found or invalid" };
  }

  const hasIgnore = IGNORE.some((k) => blob.includes(k));
  const hasSuccess = SUCCESS_HINTS.some((k) => blob.includes(k));
  const structured =
    body.amount != null || body.nominal != null || payment?.amount != null;
  if (hasIgnore && !hasSuccess && !structured) {
    return { ok: false, error: "ignored non-success notification" };
  }

  let merchantId = String(
    body.merchantId ?? body.merchant_id ?? body.merchant ?? ""
  )
    .toLowerCase()
    .trim();

  if (!merchantId && packageName && PACKAGE_TO_MERCHANT[packageName]) {
    merchantId = PACKAGE_TO_MERCHANT[packageName];
  }
  if (!merchantId) {
    if (/whatsapp|wa business/i.test(packageName || "") || /whatsapp/i.test(blob))
      merchantId = "whatsapp";
    else if (/dana/i.test(blob) || /dana/i.test(packageName || ""))
      merchantId = "dana";
    else if (/gopay|gojek/i.test(blob)) merchantId = "gopay";
    else if (/\bbri\b/i.test(blob)) merchantId = "bri";
    else if (/interactive/i.test(blob)) merchantId = "interactive";
    else merchantId = "unknown";
  }

  const senderName =
    body.senderName != null
      ? String(body.senderName)
      : payment?.sender_name != null
        ? String(payment.sender_name)
        : extractSender(combined);

  let paymentSource: string | null =
    body.paymentSource != null
      ? String(body.paymentSource)
      : body.source != null
        ? String(body.source)
        : payment?.payment_source != null
          ? String(payment.payment_source)
          : null;

  if (!paymentSource) {
    if (merchantId === "dana") paymentSource = "DANA";
    else if (merchantId === "whatsapp") paymentSource = "WhatsApp";
  }

  return {
    ok: true,
    data: {
      merchantId,
      amount,
      paymentSource,
      senderName,
      rawTitle: title || null,
      rawText: text || big || null,
      packageName,
    },
  };
}
