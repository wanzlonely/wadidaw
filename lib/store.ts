import { getRedis, KEYS } from "./redis";
import { allocateUniqueCode, buildTotalAmount } from "./unique-code";

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
  uniqueCode: number;
  totalAmount: number;
  token: string;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  status: "pending" | "success" | "expired" | "cancelled";
  createdAt: string;
  paidAt?: string | null;
  matchedPaymentId?: string | null;
  expiresAt?: string | null;
  mode: "dynamic" | "static";
  qrisStaticId?: string | null;
  dynamicQris?: string | null;
  adminFee?: number;
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

function parseRow<T>(x: unknown): T {
  if (typeof x === "string") return JSON.parse(x) as T;
  return x as T;
}

async function nextId(prefix: string) {
  const redis = getRedis();
  const n = await redis.incr(KEYS.seq);
  return `${prefix}_${n}_${Date.now()}`;
}

function randomToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

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

async function loadOrders(): Promise<Order[]> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.orders, 0, MAX_ORDERS - 1);
  return raw.map((x) => {
    const o = parseRow<Order & { uniqueCode?: number; totalAmount?: number; token?: string; mode?: string }>(x);
    if (o.uniqueCode == null) {
      o.uniqueCode = 0;
      o.totalAmount = o.amount;
      o.mode = "static";
    }
    if (!o.token) o.token = o.id;
    if (!o.mode) o.mode = o.uniqueCode > 0 ? "dynamic" : "static";
    return o as Order;
  });
}

async function takenUniqueCodes(): Promise<Set<number>> {
  const orders = await loadOrders();
  const now = Date.now();
  const taken = new Set<number>();
  for (const o of orders) {
    if (o.status !== "pending") continue;
    if (o.expiresAt && new Date(o.expiresAt).getTime() < now) continue;
    if (o.uniqueCode >= 100 && o.uniqueCode <= 999) taken.add(o.uniqueCode);
  }
  return taken;
}

export async function createOrder(input: {
  amount: number;
  reference?: string | null;
  customerName?: string | null;
  note?: string | null;
  expiresInMinutes?: number;
  dynamic?: boolean;
  adminFee?: number;
}): Promise<Order> {
  const redis = getRedis();
  const now = new Date();
  const expMin =
    input.expiresInMinutes != null && input.expiresInMinutes > 0
      ? input.expiresInMinutes
      : 30;
  const expiresAt = new Date(now.getTime() + expMin * 60_000).toISOString();

  const base = Math.round(input.amount);
  const useDynamic = input.dynamic !== false;
  const adminFee = Math.max(0, Math.round(input.adminFee ?? 0));

  let uniqueCode = 0;
  let totalAmount = base + adminFee;
  let mode: Order["mode"] = "static";

  if (useDynamic) {
    const taken = await takenUniqueCodes();
    uniqueCode = allocateUniqueCode(taken);
    totalAmount = buildTotalAmount(base, uniqueCode) + adminFee;
    mode = "dynamic";
  }

  const row: Order = {
    id: await nextId("ord"),
    amount: base,
    uniqueCode,
    totalAmount,
    token: randomToken(),
    reference: input.reference ?? null,
    customerName: input.customerName ?? null,
    note: input.note ?? null,
    status: "pending",
    createdAt: now.toISOString(),
    paidAt: null,
    matchedPaymentId: null,
    expiresAt,
    mode,
    adminFee,
  };

  await redis.lpush(KEYS.orders, JSON.stringify(row));
  await redis.ltrim(KEYS.orders, 0, MAX_ORDERS - 1);
  await addLog(
    "info",
    mode === "dynamic"
      ? `Order dynamic pending base Rp${row.amount} +kode ${row.uniqueCode} +adm ${adminFee} → bayar Rp${row.totalAmount}`
      : `Order static pending Rp${row.amount}`,
    { id: row.id, token: row.token, totalAmount: row.totalAmount, adminFee }
  );
  return row;
}

export async function listOrders(status?: Order["status"]): Promise<Order[]> {
  const all = await loadOrders();
  if (!status) return all;
  return all.filter((o) => o.status === status);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const all = await loadOrders();
  return all.find((o) => o.id === id) ?? null;
}

export async function getOrderByToken(token: string): Promise<Order | null> {
  const all = await loadOrders();
  return all.find((o) => o.token === token) ?? null;
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
  paymentAmount: number,
  paymentId: string
): Promise<Order | null> {
  const redis = getRedis();
  const raw = await redis.lrange(KEYS.orders, 0, MAX_ORDERS - 1);
  const now = Date.now();

  for (let i = raw.length - 1; i >= 0; i--) {
    const item = parseRow<Order & { totalAmount?: number; uniqueCode?: number; mode?: string }>(raw[i]);

    if (item.status !== "pending") continue;

    const total =
      item.totalAmount != null ? item.totalAmount : item.amount;
    const target =
      item.mode === "static" || (item.uniqueCode ?? 0) === 0
        ? item.amount
        : total;

    if (target !== paymentAmount) continue;

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
      paymentAmount,
      totalAmount: total,
    });
    try {
      await redis.set(
        KEYS.live,
        JSON.stringify({
          type: "order_paid",
          orderId: item.id,
          amount: paymentAmount,
          at: item.paidAt,
        }),
        { ex: 60 }
      );
    } catch {
      /* ignore */
    }
    return item as Order;
  }
  return null;
}

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
  try {
    await redis.set(
      KEYS.live,
      JSON.stringify({
        type: "payment",
        id: row.id,
        amount: row.amount,
        merchantId: row.merchantId,
        at: row.receivedAt,
      }),
      { ex: 60 }
    );
  } catch {
    /* ignore */
  }
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

export async function getLiveSnapshot() {
  const redis = getRedis();
  const live = await redis.get(KEYS.live);
  const payments = await listPayments();
  const pending = (await listOrders("pending")).slice(0, 20);
  return {
    live: live
      ? typeof live === "string"
        ? JSON.parse(live)
        : live
      : null,
    latestPayments: payments.slice(0, 10),
    pendingOrders: pending,
    stats: await getStats(),
  };
}

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
