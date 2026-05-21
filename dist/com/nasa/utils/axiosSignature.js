"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignature = void 0;
exports.applyStandardInterceptors = applyStandardInterceptors;
const crypto_js_1 = __importDefault(require("crypto-js"));
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const getSignature = (rawData, token) => {
    return crypto_js_1.default.HmacSHA256(rawData, token).toString(crypto_js_1.default.enc.Base64);
};
exports.getSignature = getSignature;
function applyStandardInterceptors(axiosInstance, deviceId) {
    axiosInstance.interceptors.request.use((config) => {
        const method = config.method ? config.method.toUpperCase() : "GET";
        let path = config.url || "";
        if (path.startsWith("http")) {
            const urlObj = new URL(path);
            path = urlObj.pathname + urlObj.search;
        }
        config.headers = config.headers || {};
        const setHeader = (key, value) => {
            if (typeof config.headers.set === "function") {
                config.headers.set(key, value);
            }
            else {
                config.headers[key] = value;
            }
        };
        const hasHeader = (key) => {
            if (typeof config.headers.has === "function") {
                return config.headers.has(key);
            }
            return !!config.headers[key];
        };
        const actualDeviceId = (typeof config.headers.get === "function" ? config.headers.get("X-Device-Id") : (config.headers["X-Device-Id"] || config.headers["x-device-id"])) || deviceId;
        if (!hasHeader("X-Device-Id"))
            setHeader("X-Device-Id", actualDeviceId);
        if (!hasHeader("X-Client-Type"))
            setHeader("X-Client-Type", "web");
        if (!hasHeader("Accept-Language"))
            setHeader("Accept-Language", "vi");
        if (!hasHeader("User-Agent"))
            setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        if (!hasHeader("X-Forwarded-Proto"))
            setHeader("X-Forwarded-Proto", "https");
        let body = "";
        let contentType = "";
        let contentLengthHeader = "";
        for (const key of Object.keys(config.headers)) {
            if (key.toLowerCase() === 'content-type')
                contentType = String(config.headers[key]);
            if (key.toLowerCase() === 'content-length')
                contentLengthHeader = String(config.headers[key]);
        }
        const isMultipart = contentType.includes("multipart/form-data")
            || (config.data?.constructor && config.data.constructor.name === "FormData");
        if (isMultipart) {
            // Multipart bodies cannot be serialized — backend expects empty string in signature rawData.
            // NOTE: Run 3 Spring Security failure was due to expired JWT tokens, NOT this body="" format.
            body = "";
        }
        else if (contentType.includes("application/json")) {
            if (config.data !== undefined && config.data !== null) {
                body = typeof config.data === "string" ? config.data : JSON.stringify(config.data);
            }
        }
        else if (config.data && typeof config.data === "object") {
            body = JSON.stringify(config.data);
        }
        else if (config.data !== undefined && config.data !== null) {
            body = String(config.data);
        }
        const timestamp = Math.floor(Date.now() / 1000).toString();
        let authHeader = "";
        for (const key of Object.keys(config.headers)) {
            if (key.toLowerCase() === "authorization") {
                authHeader = config.headers[key];
                break;
            }
        }
        let token = "";
        if (authHeader && typeof authHeader === "string") {
            token = authHeader.replace(/^Bearer\s+/i, "").trim();
        }
        if (path.includes("/auth/") || path.includes("/password/")) {
            token = "";
        }
        const rawData = method + "|" + path + "|" + timestamp + "|" + body;
        const signature = (0, exports.getSignature)(rawData, token);
        if (env_1.ENV.LOG_HTTP || env_1.ENV.LOG_VERBOSE) {
            console.log(`[AxiosSignature] ${method} ${path} -> Sign: ${signature} (Device: ${actualDeviceId})`);
        }
        setHeader("X-Timestamp", timestamp);
        setHeader("X-Signature", signature);
        if (!hasHeader("Idempotency-Key")) {
            setHeader("Idempotency-Key", String((0, uuid_1.v4)()));
        }
        config.__signatureDebug = {
            method,
            path,
            timestamp,
            signature,
            deviceId: actualDeviceId,
            clientType: typeof config.headers.get === "function" ? config.headers.get("X-Client-Type") : (config.headers["X-Client-Type"] || config.headers["x-client-type"]),
            forwardedProto: typeof config.headers.get === "function" ? config.headers.get("X-Forwarded-Proto") : (config.headers["X-Forwarded-Proto"] || config.headers["x-forwarded-proto"]),
            language: typeof config.headers.get === "function" ? config.headers.get("Accept-Language") : config.headers["Accept-Language"],
            contentType,
            contentLength: contentLengthHeader || (typeof config.headers.get === "function" ? config.headers.get("Content-Length") : (config.headers["Content-Length"] || config.headers["content-length"])),
            isMultipart,
            hasAuthorization: !!token,
            bodyPreview: body ? String(body).slice(0, 500) : ""
        };
        return config;
    }, (error) => Promise.reject(error));
}
