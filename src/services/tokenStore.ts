import { SecureStore } from "../storage/secureStore";
import { AsyncStore } from "../storage/asyncStore";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  savedAt: number;
  deviceId: string;
};

function aKey(u: string) { return `access:${u.toLowerCase()}`; }
function rKey(u: string) { return `refresh:${u.toLowerCase()}`; }
function mKey(u: string) { return `meta:${u.toLowerCase()}`; }

export function getStoredTokens(username: string): StoredTokens | null {
  const u = username.toLowerCase();
  const access = SecureStore.getItem<string>(aKey(u));
  const refresh = AsyncStore.getItem<string>(rKey(u));
  const meta = AsyncStore.getItem<any>(mKey(u)) ?? {};
  if (!access || !refresh) return null;
  return {
    accessToken: access,
    refreshToken: refresh,
    savedAt: Number(meta.savedAt || 0) || 0,
    deviceId: String(meta.deviceId || ""),
  };
}

export function setStoredTokens(username: string, accessToken: string, refreshToken: string, deviceId: string) {
  const u = username.toLowerCase();
  SecureStore.setItem(aKey(u), accessToken);
  AsyncStore.setItem(rKey(u), refreshToken);
  AsyncStore.setItem(mKey(u), { savedAt: Date.now(), deviceId });
}

export function clearTokensForUser(username: string) {
  const u = username.toLowerCase();
  SecureStore.removeItem(aKey(u));
  AsyncStore.removeItem(rKey(u));
  AsyncStore.removeItem(mKey(u));
}

export function clearAllData() {
  SecureStore.clear();
  AsyncStore.clear();
}
