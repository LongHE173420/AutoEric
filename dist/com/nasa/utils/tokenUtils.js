"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeJwtPayload = decodeJwtPayload;
exports.isAccessExpired = isAccessExpired;
exports.isRefreshExpired = isRefreshExpired;
exports.usernameFromToken = usernameFromToken;
const env_1 = require("../config/env");
function decodeJwtPayload(token) {
    try {
        const parts = token.split(".");
        if (parts.length < 2)
            return null;
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        return JSON.parse(jsonStr);
    }
    catch (e) {
        return null;
    }
}
function isAccessExpired(accessToken) {
    if (!accessToken)
        return true;
    const payload = decodeJwtPayload(accessToken);
    if (!payload)
        return true;
    const nowMs = Date.now();
    if (payload.exp) {
        return nowMs >= payload.exp * 1000;
    }
    const iatMs = (payload.iat || 0) * 1000;
    if (!iatMs)
        return true;
    return nowMs > iatMs + env_1.ENV.ACCESS_TTL_MS;
}
function isRefreshExpired(refreshToken) {
    if (!refreshToken)
        return true;
    const payload = decodeJwtPayload(refreshToken);
    if (!payload)
        return true;
    const nowMs = Date.now();
    if (payload.exp) {
        return nowMs >= payload.exp * 1000;
    }
    const iatMs = (payload.iat || 0) * 1000;
    if (!iatMs)
        return true;
    return nowMs > iatMs + env_1.ENV.REFRESH_TTL_MS;
}
function usernameFromToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload)
        return "";
    const username = payload.sub || payload.username || payload.name || "";
    return String(username).toLowerCase();
}
