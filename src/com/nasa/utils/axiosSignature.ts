import { AxiosInstance } from "axios";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export const getSignature = (rawData: string, token: string): string => {
    return crypto.createHmac("sha256", token).update(rawData).digest("base64");
};

export function applySignatureInterceptor(axiosInstance: AxiosInstance | any) {
    axiosInstance.interceptors.request.use(
        (config: any) => {
            const method = config.method ? config.method.toUpperCase() : "GET";

            let path = config.url || "";
            if (path.startsWith("http")) {
                const urlObj = new URL(path);
                path = urlObj.pathname + urlObj.search;
            }

            let body = "";
            if (config.data && typeof config.data === 'object') {
                body = config.data.constructor.name === "FormData" ? '' : JSON.stringify(config.data);
            } else {
                body = config.data || '';
            }

            const timestamp = Math.floor(Date.now() / 1000).toString();

            config.headers = config.headers || {};
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

            if (typeof config.headers.set === "function") {
                config.headers.set("X-Timestamp", timestamp);
                config.headers.set("X-Signature", signature);
                if (!config.headers.has("Idempotency-Key")) {
                    config.headers.set("Idempotency-Key", uuidv4());
                }
            } else {
                config.headers["X-Timestamp"] = timestamp;
                config.headers["X-Signature"] = signature;
                if (!config.headers["Idempotency-Key"]) {
                    config.headers["Idempotency-Key"] = uuidv4();
                }
            }

            return config;
        },
        (error: any) => Promise.reject(error)
    );
}
