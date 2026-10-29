import { getRedis, KEYS } from "./redis";

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
  matchedOrderId?: string | null;
};

export type Order = {
  id: string;
  amount: number;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  status: "pending" | "success" | "expired" | "cancelled";
  createdAt: string;
  paidAt?: string | null;
  matchedPaymentId?: string | null;
  expiresAt?: string | null;
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

const MAX_PAYMENTS = 1000;
const MAX_ORDERS = 500;
const MAX_LOGS = 500;
const DEDUP_TTL_SEC = 120;

/** Upstash may return string or already-parsed object from lrange. */
function parseRow<T>(x: unknown): T {
  if (typeof x === "string") return JSON.parse(x) as T;
  return x as T;
}

async function nextId(prefix: string) {
  const redis = getRedis();
  const n = await redis.incr(KEYS.seq);
  return `${prefix}_${n}_${Date.now()}`;
}

// ─── Logs ───────────────────────────────────────────────

export async function addLog(
  level: DebugLog["level"],
  message: string,
  payload?: unknown
) {
  const redis = getRedis();
  const row: DebugLog = {
    id: await nextId("log"),
    at: new Date().toISOString(),
    level,
    message,
    payload,
  };
  await redis.lpush(KEYS.logs, JSON.stringify(row));
  await redis.ltrim(KEYS.logs, 0, MAX_LOGS - 1);
}

export async function listLogs(): Promise<DebugLog[]> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.logs, 0, 199);
  return raw.map((x) => parseRow<DebugLog>(x));
}

export async function clearLogs() {
  const redis = getRedis();
  await redis.del(KEYS.logs);
}

// ─── Dedup ──────────────────────────────────────────────

export async function isDuplicatePayment(
  amount: number,
  packageName?: string | null
): Promise<boolean> {
  const redis = getRedis();
  const key = `${KEYS.dedup}:${packageName || "any"}:${amount}`;
  const exists = await redis.get(key);
  if (exists) return true;
  await redis.set(key, "1", { ex: DEDUP_TTL_SEC });
  return false;
}

// ─── Orders ─────────────────────────────────────────────

async function loadOrders(): Promise<Order[]> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.orders, 0, MAX_ORDERS - 1);
  return raw.map((x) => parseRow<Order>(x));
}

export async function createOrder(input: {
  amount: number;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  expiresInMinutes?: number;
}): Promise<Order> {
  const redis = getRedis();
  const now = new Date();
  const expiresAt =
    input.expiresInMinutes && input.expiresInMinutes > 0
      ? new Date(now.getTime() + input.expiresInMinutes * 60_000).toISOString()
      : null;

  const row: Order = {
    id: await nextId("ord"),
    amount: Math.round(input.amount),
    reference: input.reference ?? null,
    customerName: input.customerName ?? null,
    note: input.note ?? null,
    status: "pending",
    createdAt: now.toISOString(),
    paidAt: null,
    matchedPaymentId: null,
    expiresAt,
  };

  await redis.lpush(KEYS.orders, JSON.stringify(row));
  await redis.ltrim(KEYS.orders, 0, MAX_ORDERS - 1);
  await addLog("info", `Order pending Rp${row.amount}`, { id: row.id });
  return row;
}

export async function listOrders(status?: Order["status"]): Promise<Order[]> {
  const all = await loadOrders();
  if (!status) return all;
  return all.filter((o) => o.status === status);
}

export async function cancelOrder(id: string): Promise<Order | null> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.orders, 0, MAX_ORDERS - 1);
  for (let i = 0; i < raw.length; i++) {
    const item = parseRow<Order>(raw[i]);
    if (item.id === id && item.status === "pending") {
      item.status = "cancelled";
      await redis.lset(KEYS.orders, i, JSON.stringify(item));
      await addLog("info", `Order cancelled ${id}`);
      return item;
    }
  }
  return null;
}

export async function matchPendingOrder(
  amount: number,
  paymentId: string
): Promise<Order | null> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.orders, 0, MAX_ORDERS - 1);
  const now = Date.now();

  for (let i = raw.length - 1; i >= 0; i--) {
    const item = parseRow<Order>(raw[i]);

    if (item.status !== "pending") continue;
    if (item.amount !== amount) continue;

    if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
      item.status = "expired";
      await redis.lset(KEYS.orders, i, JSON.stringify(item));
      continue;
    }

    item.status = "success";
    item.paidAt = new Date().toISOString();
    item.matchedPaymentId = paymentId;
    await redis.lset(KEYS.orders, i, JSON.stringify(item));
    await addLog("info", `Order matched → success ${item.id}`, {
      orderId: item.id,
      paymentId,
      amount,
    });
    return item;
  }
  return null;
}

// ─── Payments ───────────────────────────────────────────

export async function addPayment(
  event: Omit<PaymentEvent, "id" | "receivedAt">
): Promise<PaymentEvent> {
  const redis = getRedis();
  const row: PaymentEvent = {
    ...event,
    id: await nextId("pay"),
    receivedAt: new Date().toISOString(),
  };
  await redis.lpush(KEYS.payments, JSON.stringify(row));
  await redis.ltrim(KEYS.payments, 0, MAX_PAYMENTS - 1);
  await addLog("info", `Payment Rp${row.amount} · ${row.merchantId}`, {
    id: row.id,
    amount: row.amount,
    merchantId: row.merchantId,
  });
  return row;
}

export async function updatePaymentForwardStatus(
  id: string,
  status: PaymentEvent["forwardStatus"]
) {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.payments, 0, 49);
  for (let i = 0; i < raw.length; i++) {
    const item = parseRow<PaymentEvent>(raw[i]);
    if (item.id === id) {
      item.forwardStatus = status;
      await redis.lset(KEYS.payments, i, JSON.stringify(item));
      break;
    }
  }
}

export async function attachMatchedOrder(
  paymentId: string,
  orderId: string
) {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.payments, 0, 49);
  for (let i = 0; i < raw.length; i++) {
    const item = parseRow<PaymentEvent>(raw[i]);
    if (item.id === paymentId) {
      item.matchedOrderId = orderId;
      await redis.lset(KEYS.payments, i, JSON.stringify(item));
      break;
    }
  }
}

export async function listPayments(): Promise<PaymentEvent[]> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.payments, 0, 499);
  return raw.map((x) => parseRow<PaymentEvent>(x));
}

export async function clearPayments() {
  const redis = getRedis();
  await redis.del(KEYS.payments);
  await addLog("info", "Payments cleared");
}

export async function getStats() {
  const payments = await listPayments();
  const orders = await listOrders();
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
    pendingOrders: orders.filter((o) => o.status === "pending").length,
    successOrders: orders.filter((o) => o.status === "success").length,
  };
}

// ─── Forwards ───────────────────────────────────────────

export async function listForwards(): Promise<ForwardTarget[]> {
  const redis = getRedis();
  const raw = await redis.get(KEYS.forwards);
  if (!raw) return [];
  if (typeof raw === "string") return JSON.parse(raw) as ForwardTarget[];
  return raw as ForwardTarget[];
}

async function saveForwards(list: ForwardTarget[]) {
  const redis = getRedis();
  await redis.set(KEYS.forwards, JSON.stringify(list));
}

export async function addForward(url: string): Promise<ForwardTarget> {
  const list = await listForwards();
  const row: ForwardTarget = {
    id: await nextId("fwd"),
    url: url.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  list.push(row);
  await saveForwards(list);
  await addLog("info", `Forward added: ${url}`);
  return row;
}

export async function removeForward(id: string) {
  const list = (await listForwards()).filter((f) => f.id !== id);
  await saveForwards(list);
}

export async function setForwardEnabled(id: string, enabled: boolean) {
  const list = await listForwards();
  const f = list.find((x) => x.id === id);
  if (f) {
    f.enabled = enabled;
    await saveForwards(list);
  }
}

// ─── Service flag ───────────────────────────────────────

export async function getServiceActive(): Promise<boolean> {
  const redis = getRedis();
  const v = await redis.get(KEYS.service);
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  return String(v) !== "0" && String(v) !== "false";
}

export async function setServiceActive(v: boolean) {
  const redis = getRedis();
  await redis.set(KEYS.service, v ? "1" : "0");
  await addLog("info", v ? "Service activated" : "Service paused");
}

export async function forwardPayment(payment: PaymentEvent) {
  const targets = (await listForwards()).filter((f) => f.enabled);
  if (!targets.length) {
    await updatePaymentForwardStatus(payment.id, "skip");
    return;
  }
  let ok = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        const res = await fetch(t.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payment),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) ok++;
        else await addLog("warn", `Forward ${t.url} → HTTP ${res.status}`);
      } catch (e) {
        await addLog("error", `Forward ${t.url} error`, String(e));
      }
    })
  );
  const status =
    ok === targets.length ? "ok" : ok > 0 ? "partial" : "error";
  await updatePaymentForwardStatus(payment.id, status);
}
