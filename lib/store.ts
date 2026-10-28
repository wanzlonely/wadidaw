export type PaymentEvent = {
  id: string;
  merchantId: string;
  amount: number;
  paymentSource?: string | null;
  senderName?: string | null;
  rawTitle?: string | null;
  rawText?: string | null;
  packageName?: string | null;
  receivedAt: string;
  forwardStatus?: "ok" | "partial" | "skip" | "error";
};

export type DebugLog = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  payload?: unknown;
};

export type ForwardTarget = {
  id: string;
  url: string;
  enabled: boolean;
  createdAt: string;
};

type StoreShape = {
  payments: PaymentEvent[];
  logs: DebugLog[];
  forwards: ForwardTarget[];
  serviceActive: boolean;
};

const g = globalThis as unknown as { __walzpay?: StoreShape };

if (!g.__walzpay) {
  g.__walzpay = {
    payments: [],
    logs: [],
    forwards: [],
    serviceActive: true,
  };
}

const store = g.__walzpay;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addLog(
  level: DebugLog["level"],
  message: string,
  payload?: unknown
) {
  store.logs.unshift({
    id: uid(),
    at: new Date().toISOString(),
    level,
    message,
    payload,
  });
  if (store.logs.length > 300) store.logs.length = 300;
}

export function listLogs() {
  return [...store.logs];
}

export function clearLogs() {
  store.logs.length = 0;
}

export function addPayment(
  event: Omit<PaymentEvent, "id" | "receivedAt">
): PaymentEvent {
  const row: PaymentEvent = {
    ...event,
    id: uid(),
    receivedAt: new Date().toISOString(),
  };
  store.payments.unshift(row);
  if (store.payments.length > 500) store.payments.length = 500;
  addLog("info", `Payment ${row.amount} from ${row.merchantId}`, row);
  return row;
}

export function listPayments(): PaymentEvent[] {
  return [...store.payments];
}

export function clearPayments() {
  store.payments.length = 0;
  addLog("info", "Payments cleared");
}

export function getStats() {
  const payments = store.payments;
  const totalAmount = payments.reduce((s, p) => s + p.amount, 0);
  const byMerchant: Record<string, number> = {};
  for (const p of payments) {
    byMerchant[p.merchantId] = (byMerchant[p.merchantId] ?? 0) + 1;
  }
  const today = new Date().toDateString();
  const todayPayments = payments.filter(
    (p) => new Date(p.receivedAt).toDateString() === today
  );
  return {
    count: payments.length,
    totalAmount,
    todayCount: todayPayments.length,
    todayAmount: todayPayments.reduce((s, p) => s + p.amount, 0),
    byMerchant,
    latest: payments[0] ?? null,
  };
}

export function listForwards() {
  return [...store.forwards];
}

export function addForward(url: string): ForwardTarget {
  const row: ForwardTarget = {
    id: uid(),
    url: url.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  store.forwards.push(row);
  addLog("info", `Forward target added: ${url}`);
  return row;
}

export function removeForward(id: string) {
  const i = store.forwards.findIndex((f) => f.id === id);
  if (i >= 0) store.forwards.splice(i, 1);
}

export function setForwardEnabled(id: string, enabled: boolean) {
  const f = store.forwards.find((x) => x.id === id);
  if (f) f.enabled = enabled;
}

export function getServiceActive() {
  return store.serviceActive;
}

export function setServiceActive(v: boolean) {
  store.serviceActive = v;
  addLog("info", v ? "Service activated" : "Service paused");
}

export async function forwardPayment(payment: PaymentEvent) {
  const targets = store.forwards.filter((f) => f.enabled);
  if (!targets.length) {
    payment.forwardStatus = "skip";
    return;
  }
  let ok = 0;
  for (const t of targets) {
    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payment),
      });
      if (res.ok) ok++;
      else
        addLog("warn", `Forward failed ${t.url} status ${res.status}`, {
          url: t.url,
        });
    } catch (e) {
      addLog("error", `Forward error ${t.url}`, String(e));
    }
  }
  payment.forwardStatus =
    ok === targets.length ? "ok" : ok > 0 ? "partial" : "error";
}
