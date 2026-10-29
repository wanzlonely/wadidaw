/**
 * Unique total via small random admin fee (anti-collision).
 * totalAmount = baseAmount + adminFee
 * adminFee picked randomly in [minFee, maxFee] ensuring total not used by other pending orders.
 */

/** Allocate random admin fee in [minFee, maxFee] such that base+fee is not in takenTotals. */
export function allocateAdminFee(
  baseAmount: number,
  takenTotals: Set<number>,
  minFee = 1,
  maxFee = 99
): number {
  const base = Math.round(baseAmount);
  const lo = Math.max(0, Math.round(minFee));
  const hi = Math.max(lo, Math.round(maxFee));
  const span = hi - lo + 1;

  for (let attempt = 0; attempt < Math.min(span * 3, 400); attempt++) {
    const fee = lo + Math.floor(Math.random() * span);
    const total = base + fee;
    if (!takenTotals.has(total)) {
      takenTotals.add(total);
      return fee;
    }
  }

  for (let fee = lo; fee <= hi; fee++) {
    const total = base + fee;
    if (!takenTotals.has(total)) {
      takenTotals.add(total);
      return fee;
    }
  }

  throw new Error(
    `Semua biaya admin ${lo}\u2013${hi} sedang dipakai untuk nominal ini. Tunggu order kedaluwarsa atau naikkan rentang admin di Setel.`
  );
}

export function buildTotalAmount(baseAmount: number, adminFee: number): number {
  return Math.round(baseAmount) + Math.max(0, Math.round(adminFee));
}

/**
 * Legacy 3-digit code allocator (kept for older store.ts on remote until fully updated).
 * Prefer allocateAdminFee for new flows.
 */
export function allocateUniqueCode(taken: Set<number>): number {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = 100 + Math.floor(Math.random() * 900);
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
  for (let code = 100; code <= 999; code++) {
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
  throw new Error("Semua kode unik 100\u2013999 sedang dipakai. Tunggu order kedaluwarsa.");
}
