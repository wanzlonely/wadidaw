/**
 * Static → Dynamic QRIS converter (EMVCo / BI QRIS).
 * Amount is baked into tag 54 so e-wallets (GoPay, OVO, DANA, ShopeePay, etc.)
 * charge the exact total — no separate tip field.
 */

type TLV = { tag: string; length: number; value: string; children?: TLV[] };

export type FeeOption =
  | { type: "fixed"; value: number }
  | { type: "percent"; value: number }
  | null;

/** Tags whose value is itself a TLV stream */
const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

/** Canonical EMVCo / QRIS tag order (subset we care about when rebuilding) */
const TAG_ORDER = [
  "00", "01",
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63",
];

export function calculateCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export function parseTLV(data: string): TLV[] {
  const elements: TLV[] = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    if (isNaN(length) || pos + 4 + length > data.length) break;
    const value = data.substring(pos + 4, pos + 4 + length);
    const element: TLV = { tag, length, value };
    if (NESTED_TAGS.has(tag)) element.children = parseTLV(value);
    elements.push(element);
    pos += 4 + length;
  }
  return elements;
}

function buildTLVString(elements: TLV[]): string {
  return elements
    .map((el) => {
      const value = el.children ? buildTLVString(el.children) : el.value;
      const length = value.length.toString().padStart(2, "0");
      return `${el.tag}${length}${value}`;
    })
    .join("");
}

function makeTLV(tag: string, value: string): TLV {
  return { tag, length: value.length, value };
}

function sortByTagOrder(elements: TLV[]): TLV[] {
  const rank = (tag: string) => {
    const i = TAG_ORDER.indexOf(tag);
    return i === -1 ? 500 + parseInt(tag, 10) : i;
  };
  return [...elements].sort((a, b) => rank(a.tag) - rank(b.tag));
}

export function parseQrisMeta(qrisString: string): {
  merchantName: string;
  merchantCity: string;
  method: "static" | "dynamic";
} {
  const raw = parseTLV(qrisString.trim());
  const find = (tag: string) => raw.find((t) => t.tag === tag)?.value ?? "";
  const methodVal = find("01");
  return {
    merchantName: find("59") || "Merchant",
    merchantCity: find("60") || "",
    method: methodVal === "12" ? "dynamic" : "static",
  };
}

export function isLikelyQris(s: string): boolean {
  const t = s.trim().replace(/\s/g, "");
  return (
    t.startsWith("000201") &&
    t.length >= 50 &&
    /63\d{2}[0-9A-Fa-f]{4}$/.test(t)
  );
}

export function computeAdminFee(
  baseAmount: number,
  fee: FeeOption
): number {
  if (!fee) return 0;
  if (fee.type === "fixed") return Math.max(0, Math.round(fee.value));
  return Math.max(0, Math.round((baseAmount * fee.value) / 100));
}

/**
 * Convert static QRIS → dynamic with fixed amount (tag 54).
 * Compatible with major ID e-wallets when the source static QR is valid.
 */
export function convertStaticToDynamic(
  qrisString: string,
  amount: number,
  _fee: FeeOption = null
): string {
  const clean = qrisString.trim().replace(/\s/g, "");
  if (!isLikelyQris(clean)) {
    throw new Error("String QRIS tidak valid");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal harus > 0");
  }

  // Integer IDR only — no decimals (BI QRIS / currency 360)
  const amountStr = String(Math.round(amount));
  if (!/^\d{1,13}$/.test(amountStr)) {
    throw new Error("Nominal di luar batas QRIS");
  }

  const elements = parseTLV(clean);
  if (elements.length === 0) {
    throw new Error("Gagal parse TLV QRIS");
  }

  // Drop amount / tip / CRC — we rebuild them
  const skip = new Set(["54", "55", "56", "57", "63"]);
  const kept: TLV[] = [];

  for (const el of elements) {
    if (skip.has(el.tag)) continue;
    if (el.tag === "01") {
      // 12 = dynamic / amount known
      kept.push(makeTLV("01", "12"));
      continue;
    }
    kept.push(el);
  }

  // Ensure currency IDR (360) exists
  if (!kept.some((e) => e.tag === "53")) {
    kept.push(makeTLV("53", "360"));
  }

  // Fixed transaction amount
  kept.push(makeTLV("54", amountStr));

  const ordered = sortByTagOrder(kept);
  const withoutCRC = buildTLVString(ordered);
  const crcInput = withoutCRC + "6304";
  const crc = calculateCRC16(crcInput);
  const out = crcInput + crc;

  if (!isLikelyQris(out)) {
    throw new Error("Hasil konversi QRIS tidak valid");
  }

  // Sanity: amount tag present
  if (!out.includes(`54${amountStr.length.toString().padStart(2, "0")}${amountStr}`)) {
    throw new Error("Tag nominal gagal disisipkan");
  }

  return out;
}
