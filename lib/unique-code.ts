/**
 * Unique amount code for dynamic QRIS-style matching.
 * Base amount + 3-digit code so concurrent pending orders never share the same total.
 * Example: base 50000 → total 50123 (code 123)
 */

const usedCodes = new Set<number>();

/** Allocate a 3-digit code (100–999) not currently in `taken`. */
export function allocateUniqueCode(taken: Set<number>): number {
  // Prefer random to avoid predictable sequences
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = 100 + Math.floor(Math.random() * 900);
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
  // Fallback sequential
  for (let code = 100; code <= 999; code++) {
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
  throw new Error("Semua kode unik 100–999 sedang dipakai. Tunggu order expired.");
}

export function buildTotalAmount(baseAmount: number, uniqueCode: number): number {
  // Append code as last 3 digits without breaking large amounts:
  // total = base * 1000 + code would explode. Instead: base + code (Mutasiku-style).
  return Math.round(baseAmount) + uniqueCode;
}

export function extractBaseAndCode(
  totalAmount: number,
  baseAmount: number
): { base: number; code: number } | null {
  const code = totalAmount - Math.round(baseAmount);
  if (code >= 100 && code <= 999) return { base: Math.round(baseAmount), code };
  return null;
}
