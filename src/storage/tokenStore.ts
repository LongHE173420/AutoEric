import { SecureStore } from "./secureStore";
import { AsyncStore } from "./asyncStore";

export type StoredTokens = {
    accessToken: string;
    refreshToken: string;
    savedAt: number;
    deviceId: string;
};

function aKey(p: string) { return `access:${p.toLowerCase()}`; }
function rKey(p: string) { return `refresh:${p.toLowerCase()}`; }
function mKey(p: string) { return `meta:${p.toLowerCase()}`; }

export function getStoredTokens(phone: string): StoredTokens | null {
    const p = phone.toLowerCase();
    const access = SecureStore.getItem<string>(aKey(p));
    const refresh = AsyncStore.getItem<string>(rKey(p));
    const meta = AsyncStore.getItem<any>(mKey(p)) ?? {};
    if (!access || !refresh) return null;
    return {
        accessToken: access,
        refreshToken: refresh,
        savedAt: Number(meta.savedAt || 0) || 0,
        deviceId: String(meta.deviceId || ""),
    };
}

export function setStoredTokens(phone: string, accessToken: string, refreshToken: string, deviceId: string) {
    const p = phone.toLowerCase();
    SecureStore.setItem(aKey(p), accessToken);
    AsyncStore.setItem(rKey(p), refreshToken);
    AsyncStore.setItem(mKey(p), { savedAt: Date.now(), deviceId });
}

export function clearTokensForUser(phone: string) {
    const p = phone.toLowerCase();
    SecureStore.removeItem(aKey(p));
    AsyncStore.removeItem(rKey(p));
    AsyncStore.removeItem(mKey(p));
}

export function clearAllData() {
    SecureStore.clear();
    AsyncStore.clear();
}
