"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHeaders = buildHeaders;
function buildHeaders(deviceId, userAgent) {
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Type": "mobile",
        "X-Device-Id": deviceId,
        "X-Forwarded-Proto": "https",
        "User-Agent": userAgent,
        "Accept-Language": "vi"
    };
}
