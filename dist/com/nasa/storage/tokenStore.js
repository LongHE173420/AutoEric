"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoredTokens = getStoredTokens;
exports.setStoredTokens = setStoredTokens;
exports.clearTokensForUser = clearTokensForUser;
exports.clearAllData = clearAllData;
const secureStore_1 = require("./secureStore");
const asyncStore_1 = require("./asyncStore");
function aKey(p) { return `access:${p.toLowerCase()}`; }
function rKey(p) { return `refresh:${p.toLowerCase()}`; }
function mKey(p) { return `meta:${p.toLowerCase()}`; }
function getStoredTokens(phone) {
    const p = phone.toLowerCase();
    const access = secureStore_1.SecureStore.getItem(aKey(p));
    const refresh = asyncStore_1.AsyncStore.getItem(rKey(p));
    const meta = asyncStore_1.AsyncStore.getItem(mKey(p)) ?? {};
    if (!access || !refresh)
        return null;
    return {
        accessToken: access,
        refreshToken: refresh,
        savedAt: Number(meta.savedAt || 0) || 0,
        deviceId: String(meta.deviceId || ""),
        userAgent: meta.userAgent ? String(meta.userAgent) : undefined,
    };
}
function setStoredTokens(phone, accessToken, refreshToken, deviceId, userAgent) {
    const p = phone.toLowerCase();
    secureStore_1.SecureStore.setItem(aKey(p), accessToken);
    asyncStore_1.AsyncStore.setItem(rKey(p), refreshToken);
    asyncStore_1.AsyncStore.setItem(mKey(p), { savedAt: Date.now(), deviceId, userAgent });
}
function clearTokensForUser(phone) {
    const p = phone.toLowerCase();
    secureStore_1.SecureStore.removeItem(aKey(p));
    asyncStore_1.AsyncStore.removeItem(rKey(p));
    asyncStore_1.AsyncStore.removeItem(mKey(p));
}
function clearAllData() {
    secureStore_1.SecureStore.clear();
    asyncStore_1.AsyncStore.clear();
}
