import { AxiosInstance } from "axios";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export const getSignature = (rawData: string, token: string): string => {
    return crypto.createHmac("sha256", token).update(rawData).digest("base64");
};

export function applyStandardInterceptors(axiosInstance: AxiosInstance | any, deviceId: string) {
    axiosInstance.interceptors.request.use(
        (config: any) => {
            const method = config.method ? config.method.toUpperCase() : "GET";

            let path = config.url || "";
            if (path.startsWith("http")) {
                const urlObj = new URL(path);
                path = urlObj.pathname + urlObj.search;
            }

            // Set mandatory headers first
            config.headers = config.headers || {};

            // Apply standard identity headers if not already set
            const setHeader = (key: string, value: string) => {
                if (typeof config.headers.set === "function") {
                    config.headers.set(key, value);
                } else {
                    config.headers[key] = value;
                }
            };

            const hasHeader = (key: string) => {
                if (typeof config.headers.has === "function") {
                    return config.headers.has(key);
                }
                return !!config.headers[key];
            };

            const actualDeviceId = (typeof config.headers.get === "function" ? config.headers.get("X-Device-Id") : (config.headers["X-Device-Id"] || config.headers["x-device-id"])) || deviceId;

            if (!hasHeader("X-Device-Id")) setHeader("X-Device-Id", actualDeviceId);
            if (!hasHeader("X-Client-Type")) setHeader("X-Client-Type", "web");
            if (!hasHeader("Accept-Language")) setHeader("Accept-Language", "vi");
            if (!hasHeader("User-Agent")) setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            if (!hasHeader("X-Forwarded-Proto")) setHeader("X-Forwarded-Proto", "https");

            let body = "";
            if (config.data && typeof config.data === 'object') {
                body = config.data.constructor.name === "FormData" ? '' : JSON.stringify(config.data);
            } else {
                body = config.data || '';
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
            const signature = getSignature(rawData, token);
            console.log(`[AxiosSignature] ${method} ${path} -> Sign: ${signature} (Device: ${actualDeviceId})`);

            setHeader("X-Timestamp", timestamp);
            setHeader("X-Signature", signature);
            if (!hasHeader("Idempotency-Key")) {
                setHeader("Idempotency-Key", uuidv4());
            }

            return config;
        },
        (error: any) => Promise.reject(error)
    );
}
