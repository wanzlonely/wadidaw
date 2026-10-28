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
const MAX_LOGS = 500;

async function nextId(prefix: string) {
  const redis = getRedis();
  const n = await redis.incr(KEYS.seq);
  return `${prefix}_${n}_${Date.now()}`;
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
  const raw = await redis.lrange<string>(KEYS.logs, 0, 199);
  return raw.map((x) => (typeof x === "string" ? JSON.parse(x) : x));
}

export async function clearLogs() {
  const redis = getRedis();
  await redis.del(KEYS.logs);
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
  return row;
}

export async function updatePaymentForwardStatus(
  id: string,
  status: PaymentEvent["forwardStatus"]
) {
  const redis = getRedis();
  const raw = await redis.lrange<string>(KEYS.payments, 0, 49);
  for (let i = 0; i < raw.length; i++) {
    const item = typeof raw[i] === "string" ? JSON.parse(raw[i] as string) : raw[i];
    if (item.id === id) {
      item.forwardStatus = status;
      await redis.lset(KEYS.payments, i, JSON.stringify(item));
      break;
    }
  }
}

export async function listPayments(): Promise<PaymentEvent[]> {
  const redis = getRedis();
  const raw = await redis.lrange<string>(KEYS.payments, 0, 499);
  return raw.map((x) => (typeof x === "string" ? JSON.parse(x) : x));
}

export async function clearPayments() {
  const redis = getRedis();
  await redis.del(KEYS.payments);
  await addLog("info", "Payments cleared");
}

export async function getStats() {
  const payments = await listPayments();
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

export async function listForwards(): Promise<ForwardTarget[]> {
  const redis = getRedis();
  const raw = await redis.get<string | ForwardTarget[]>(KEYS.forwards);
  if (!raw) return [];
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
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
  const v = await redis.get<string | boolean>(KEYS.service);
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  return v !== "0" && v !== "false";
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
        else
          await addLog("warn", `Forward ${t.url} → HTTP ${res.status}`);
      } catch (e) {
        await addLog("error", `Forward ${t.url} error`, String(e));
      }
    })
  );
  const status =
    ok === targets.length ? "ok" : ok > 0 ? "partial" : "error";
  await updatePaymentForwardStatus(payment.id, status);
}
