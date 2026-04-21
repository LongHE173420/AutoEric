"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNetworkError = isNetworkError;
function isNetworkError(err) {
    const msg = String(err?.message || "");
    const status = err?.response?.status;
    return msg.includes("ETIMEDOUT") ||
        msg.includes("socket hang up") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("socket disconnected") ||
        msg.includes("TLS") ||
        msg.includes("aborted") ||
        msg.includes("Proxy connection ended before receiving CONNECT response") ||
        status === 502 ||
        status === 503 ||
        status === 504;
}
