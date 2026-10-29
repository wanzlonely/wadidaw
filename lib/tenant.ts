import { userKeys, LEGACY_KEYS } from "./redis";

let currentUserId: string | null = null;

export function setTenant(userId: string | null) {
  currentUserId = userId;
}

export function getTenantId(): string | null {
  return currentUserId;
}

/** Key set aktif: per-user jika tenant diset, else legacy global */
export function K() {
  if (currentUserId) return userKeys(currentUserId);
  return LEGACY_KEYS;
}
