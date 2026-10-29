import { getRedis, KEYS } from "./redis";
import { K } from "./tenant";
import { parseQrisMeta, isLikelyQris } from "./qris-convert";

export type StaticQris = {
  id: string;
  label: string;
  qrisString: string;
  merchantName: string;
  merchantCity: string;
  packageHint?: string | null;
  createdAt: string;
};

const MAX_STATIC_QRIS = 3;

async function nextId(prefix: string) {
  const redis = getRedis();
  const n = await redis.incr(KEYS.seq);
  return `${prefix}_${n}_${Date.now()}`;
}

export async function listStaticQris(): Promise<StaticQris[]> {
  const redis = getRedis();
  const raw = await redis.get(K().qrisStatic);
  if (!raw) return [];
  if (typeof raw === "string") return JSON.parse(raw) as StaticQris[];
  return raw as StaticQris[];
}

async function saveStaticQris(list: StaticQris[]) {
  const redis = getRedis();
  await redis.set(K().qrisStatic, JSON.stringify(list));
}

export async function addStaticQris(input: {
  label?: string | null;
  qrisString: string;
  packageHint?: string | null;
}): Promise<StaticQris> {
  const clean = input.qrisString.trim().replace(/\s/g, "");
  if (!isLikelyQris(clean)) {
    throw new Error("String QRIS tidak valid (harus EMVCo 000201…)");
  }
  const list = await listStaticQris();
  if (list.length >= MAX_STATIC_QRIS) {
    throw new Error(`Maksimal ${MAX_STATIC_QRIS} QRIS statis. Hapus salah satu dulu.`);
  }
  if (list.some((x) => x.qrisString === clean)) {
    throw new Error("QRIS ini sudah tersimpan");
  }
  const meta = parseQrisMeta(clean);
  const row: StaticQris = {
    id: await nextId("qris"),
    label: (input.label || meta.merchantName || "QRIS").slice(0, 60),
    qrisString: clean,
    merchantName: meta.merchantName,
    merchantCity: meta.merchantCity,
    packageHint: input.packageHint ?? null,
    createdAt: new Date().toISOString(),
  };
  list.push(row);
  await saveStaticQris(list);
  return row;
}

export async function removeStaticQris(id: string): Promise<boolean> {
  const list = await listStaticQris();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await saveStaticQris(next);
  return true;
}

export async function updateStaticQrisPackage(
  id: string,
  packageHint: string | null
): Promise<StaticQris | null> {
  const list = await listStaticQris();
  const row = list.find((x) => x.id === id);
  if (!row) return null;
  row.packageHint = packageHint;
  await saveStaticQris(list);
  return row;
}

export async function getStaticQris(id: string): Promise<StaticQris | null> {
  const list = await listStaticQris();
  return list.find((x) => x.id === id) ?? null;
}
