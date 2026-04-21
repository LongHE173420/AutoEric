"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthServiceApi = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const axiosSignature_1 = require("../../utils/axiosSignature");
class AuthServiceApi {
    constructor(deviceId, baseURL = env_1.ENV.KONG_URL, proxyAgent) {
        const config = {
            baseURL,
            timeout: 12000,
        };
        if (proxyAgent) {
            config.httpsAgent = proxyAgent;
        }
        this.http = axios_1.default.create(config);
        (0, axiosSignature_1.applyStandardInterceptors)(this.http, deviceId);
    }
    // --- LOGIN ---
    async login(phone, password, headers) {
        return this.http.post("/api/auth/login", { username: phone, password }, { headers });
    }
    async verifyLoginOtp(phone, otp, headers) {
        return this.http.post("/api/auth/verify-login-otp", { username: phone, otp, channel: "EMAIL" }, { headers });
    }
    async resendLoginOtp(phone, headers) {
        return this.http.post("/api/auth/resend-otp-login", { username: phone, channel: "EMAIL" }, { headers });
    }
    // --- PASSWORD ---
    async forgotPassword(phone, headers) {
        return this.http.post("/api/password/forgot", { username: phone }, { headers });
    }
    async verifyForgotOtp(phone, otp, headers) {
        return this.http.post("/api/password/verify-otp", { username: phone, otp }, { headers });
    }
    async resetPassword(data, headers) {
        return this.http.post("/api/password/reset", data, { headers });
    }
    async resendForgotOtp(phone, headers) {
        return this.http.post("/api/password/resend-otp-forgot", { username: phone }, { headers });
    }
    async changePassword(accessToken, data) {
        return this.http.post("/api/v1/auth/change-password", data, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
    // --- SESSION & OTHERS ---
    async refreshToken(refreshToken, headers) {
        return this.http.post("/api/auth/refresh", { refreshToken }, { headers });
    }
    async logout(accessToken, refreshToken) {
        return this.http.post("/api/auth/logout", { refreshToken }, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
    async saveTrustedDevice(accessToken, deviceId) {
        return this.http.post("/api/trusted-device/save", { deviceId }, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
    // --- MFA ---
    async setupMfa(accessToken) {
        return this.http.post("/api/v1/mfa/setup", {}, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    async confirmMfa(accessToken, otp) {
        return this.http.post("/api/v1/mfa/confirm-setup", { otp }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    async disableMfa(accessToken, otp) {
        return this.http.post("/api/v1/mfa/disable", { otp }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    async debugRedisOtp(phone, context = "LOGIN", headers) {
        if (env_1.ENV.UPSTASH_REDIS_REST_URL && env_1.ENV.UPSTASH_REDIS_REST_TOKEN) {
            const baseUrl = env_1.ENV.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
            const key = `otp:${context.toLowerCase()}:${phone}`;
            const redisUrl = `${baseUrl}/get/${key}`;
            const res = await axios_1.default.get(redisUrl, {
                headers: {
                    Authorization: `Bearer ${env_1.ENV.UPSTASH_REDIS_REST_TOKEN}`
                }
            });
            if (res.data?.result) {
                return { data: { data: { otp: res.data.result, timestamp: Date.now() } } };
            }
            return { data: { data: null } };
        }
        return this.http.get(env_1.ENV.OTP_DEBUG_PATH_REDIS, {
            params: { username: phone, context },
            headers,
        });
    }
}
exports.AuthServiceApi = AuthServiceApi;
