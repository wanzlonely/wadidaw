export type PaymentEvent = {
  id: string;
  merchantId: string;
  amount: number;
  paymentSource?: string | null;
  senderName?: string | null;
  rawTitle?: string | null;
  rawText?: string | null;
  receivedAt: string;
};

/**
 * In-memory store for demo / single-instance.
 * On Vercel serverless, each instance has its own memory —
 * replace with Vercel KV, Redis, or a DB for production.
 */
const globalForPayments = globalThis as unknown as {
  walzpayPayments?: PaymentEvent[];
};

if (!globalForPayments.walzpayPayments) {
  globalForPayments.walzpayPayments = [];
}

const payments = globalForPayments.walzpayPayments;

export function addPayment(
  event: Omit<PaymentEvent, "id" | "receivedAt">
): PaymentEvent {
  const row: PaymentEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    receivedAt: new Date().toISOString(),
  };
  payments.unshift(row);
  if (payments.length > 200) payments.length = 200;
  return row;
}

export function listPayments(): PaymentEvent[] {
  return [...payments];
}

export function clearPayments(): void {
  payments.length = 0;
}
