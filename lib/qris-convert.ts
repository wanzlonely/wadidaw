/**
 * Static → Dynamic QRIS converter (EMVCo / BI).
 * Adapted from https://github.com/verssache/qris-dinamis
 */

type TLV = { tag: string; length: number; value: string; children?: TLV[] };

export type FeeOption =
  | { type: "fixed"; value: number }
  | { type: "percent"; value: number }
  | null;

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

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
  const t = s.trim();
  return t.startsWith("000201") && t.length >= 50 && /63\d{2}[0-9A-Fa-f]{4}$/.test(t);
}

export function computeAdminFee(
  baseAmount: number,
  fee: FeeOption
): number {
  if (!fee) return 0;
  if (fee.type === "fixed") return Math.max(0, Math.round(fee.value));
  return Math.max(0, Math.round((baseAmount * fee.value) / 100));
}

export function convertStaticToDynamic(
  qrisString: string,
  amount: number,
  fee: FeeOption = null
): string {
  const clean = qrisString.trim().replace(/\s/g, "");
  if (!isLikelyQris(clean)) {
    throw new Error("String QRIS tidak valid");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal harus > 0");
  }

  const elements = parseTLV(clean);
  const result: TLV[] = [];
  let amountInserted = false;
  const managedTags = new Set(["54", "55", "56", "57", "63"]);

  for (const el of elements) {
    if (managedTags.has(el.tag)) continue;

    if (el.tag === "01") {
      result.push(makeTLV("01", "12"));
      continue;
    }

    if (el.tag === "58" && !amountInserted) {
      result.push(makeTLV("54", String(Math.round(amount))));
      if (fee && fee.value > 0) {
        if (fee.type === "fixed") {
          result.push(makeTLV("55", "02"));
          result.push(makeTLV("56", String(Math.round(fee.value))));
        } else {
          result.push(makeTLV("55", "03"));
          result.push(makeTLV("57", String(fee.value)));
        }
      }
      amountInserted = true;
    }

    result.push(el);
  }

  if (!amountInserted) {
    result.push(makeTLV("54", String(Math.round(amount))));
  }

  const withoutCRC = buildTLVString(result);
  const crcInput = withoutCRC + "6304";
  return crcInput + calculateCRC16(crcInput);
}
