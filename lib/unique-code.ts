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
    `Semua biaya admin ${lo}–${hi} sedang dipakai untuk nominal ini. Tunggu order expired atau naikkan rentang admin di Profil.`
  );
}

export function buildTotalAmount(baseAmount: number, adminFee: number): number {
  return Math.round(baseAmount) + Math.max(0, Math.round(adminFee));
}
