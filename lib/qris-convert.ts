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

export type QrisMeta = {
  merchantName: string;
  merchantCity: string;
  postalCode: string;
  issuer: string;
  method: "static" | "dynamic";
  category: string;
  categoryCode: string;
  currency: string;
  currencyCode: string;
};

/** Tags whose value is itself a TLV stream */
const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

const TAG_ORDER = [
  "00", "01",
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63",
];

/** Common MCC → readable category (ID focus) */
const MCC_MAP: Record<string, string> = {
  "5411": "Grocery / Supermarket",
  "5412": "Convenience Store",
  "5499": "Misc Food Store",
  "5812": "Restaurant",
  "5814": "Fast Food",
  "5813": "Bar / Cafe",
  "5441": "Candy / Nut Store",
  "5451": "Dairy Store",
  "5462": "Bakery",
  "5300": "Wholesale",
  "5311": "Department Store",
  "5331": "Variety Store",
  "5399": "General Merchandise",
  "5541": "Service Station",
  "5542": "Fuel Dispenser",
  "5912": "Pharmacy",
  "5921": "Liquor Store",
  "5941": "Sporting Goods",
  "5942": "Book Store",
  "5944": "Jewelry",
  "5945": "Hobby / Toy",
  "5947": "Gift / Souvenir",
  "5977": "Cosmetic Store",
  "5999": "Misc Retail",
  "6010": "Financial Institution",
  "6011": "ATM",
  "6300": "Insurance",
  "7011": "Lodging",
  "7230": "Beauty / Barber",
  "7298": "Health Spa",
  "7832": "Cinema",
  "7999": "Recreation",
  "8011": "Doctors",
  "8021": "Dentists",
  "8062": "Hospital",
  "8099": "Medical Services",
  "8211": "Schools",
  "8220": "Colleges",
  "8299": "Education Services",
  "8398": "Charity",
  "8651": "Religious Org",
  "8661": "Civic / Social",
  "8999": "Professional Services",
  "9399": "Government",
};

function mccCategory(code: string): string {
  if (!code) return "—";
  if (MCC_MAP[code]) return MCC_MAP[code];
  // Food store range heuristic
  const n = parseInt(code, 10);
  if (n >= 5400 && n <= 5499) return "Food Store";
  if (n >= 5800 && n <= 5814) return "Food & Beverage";
  if (n >= 5300 && n <= 5399) return "Retail";
  return `MCC ${code}`;
}

function currencyLabel(code: string): string {
  if (code === "360") return "IDR (Rupiah)";
  if (code === "840") return "USD";
  if (code === "978") return "EUR";
  if (code === "702") return "SGD";
  return code ? `ISO ${code}` : "IDR (Rupiah)";
}

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

/** Extract issuer GUI from MAI tags 26–51 (prefer ID.* / *.WWW) */
function extractIssuer(elements: TLV[]): string {
  const candidates: string[] = [];
  for (const el of elements) {
    if (!NESTED_TAGS.has(el.tag) || el.tag === "62") continue;
    const kids = el.children ?? parseTLV(el.value);
    const gui = kids.find((c) => c.tag === "00")?.value ?? "";
    if (gui) candidates.push(gui);
  }
  // Prefer Indonesian QRIS GUI
  const idn = candidates.find((g) => /ID\.|\.WWW|QRIS|DANA|GOPAY|OVO|SHOPEE|LINKAJA|BCA|BNI|MANDIRI|BRI/i.test(g));
  return idn || candidates[0] || "—";
}

export function parseQrisMeta(qrisString: string): QrisMeta {
  const raw = parseTLV(qrisString.trim().replace(/\s/g, ""));
  const find = (tag: string) => raw.find((t) => t.tag === tag)?.value ?? "";
  const methodVal = find("01");
  const mcc = find("52");
  const cur = find("53") || "360";
  return {
    merchantName: find("59") || "Merchant",
    merchantCity: find("60") || "",
    postalCode: find("61") || "",
    issuer: extractIssuer(raw),
    method: methodVal === "12" ? "dynamic" : "static",
    category: mccCategory(mcc),
    categoryCode: mcc,
    currency: currencyLabel(cur),
    currencyCode: cur,
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

  const amountStr = String(Math.round(amount));
  if (!/^\d{1,13}$/.test(amountStr)) {
    throw new Error("Nominal di luar batas QRIS");
  }

  const elements = parseTLV(clean);
  if (elements.length === 0) {
    throw new Error("Gagal parse TLV QRIS");
  }

  const skip = new Set(["54", "55", "56", "57", "63"]);
  const kept: TLV[] = [];

  for (const el of elements) {
    if (skip.has(el.tag)) continue;
    if (el.tag === "01") {
      kept.push(makeTLV("01", "12"));
      continue;
    }
    kept.push(el);
  }

  if (!kept.some((e) => e.tag === "53")) {
    kept.push(makeTLV("53", "360"));
  }

  kept.push(makeTLV("54", amountStr));

  const ordered = sortByTagOrder(kept);
  const withoutCRC = buildTLVString(ordered);
  const crcInput = withoutCRC + "6304";
  const crc = calculateCRC16(crcInput);
  const out = crcInput + crc;

  if (!isLikelyQris(out)) {
    throw new Error("Hasil konversi QRIS tidak valid");
  }

  if (!out.includes(`54${amountStr.length.toString().padStart(2, "0")}${amountStr}`)) {
    throw new Error("Tag nominal gagal disisipkan");
  }

  return out;
}
