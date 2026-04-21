"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginWithOtpFlow = loginWithOtpFlow;
exports.ensureValidAccessToken = ensureValidAccessToken;
exports.getMeWithAutoAuth = getMeWithAutoAuth;
const env_1 = require("../../config/env");
const tokenStore_1 = require("../../storage/tokenStore");
const log_1 = require("../../utils/log");
const tokenUtils_1 = require("../../utils/tokenUtils");
const headers_1 = require("../../utils/headers");
const userApiService_1 = require("../../api/user/userApiService");
function summarizeToken(token) {
    try {
        const payload = token ? (0, tokenUtils_1.decodeJwtPayload)(token) : null;
        if (!token || !payload) {
            return { present: !!token, validJwt: false };
        }
        return {
            present: true,
            validJwt: true,
            sub: payload.sub,
            id: payload.id,
            clientType: payload.clientType,
            deviceId: payload.deviceId,
            iat: payload.iat,
            exp: payload.exp
        };
    }
    catch (e) {
        return { present: false, validJwt: false };
    }
}
function parseOtp(data) {
    try {
        if (!data)
            return { otp: null, tsMs: null };
        const direct = data.otp ?? data.smsOtp ?? data.otpKeyOtp;
        const msgOtp = data.msg?.otp ?? data.smsLatest?.otp;
        const otp = String(direct ?? msgOtp ?? "").trim();
        const tsRaw = data.msg?.timestamp ?? data.msg?.received_at ?? data.timestamp;
        let tsMs = null;
        if (tsRaw) {
            const n = Number(tsRaw);
            tsMs = Number.isFinite(n) ? n : Date.parse(String(tsRaw)) || null;
        }
        return { otp: otp.length >= 4 ? otp : null, tsMs };
    }
    catch (e) {
        return { otp: null, tsMs: null };
    }
}
async function waitForOtp(api, phone, opts = {}) {
    try {
        const { timeoutMs = env_1.ENV.OTP_TIMEOUT_MS, pollMs = env_1.ENV.OTP_POLL_MS, sinceMs = 0, context = "LOGIN", logger, headers } = opts;
        const t0 = Date.now();
        let lastOtp = null;
        while (Date.now() - t0 < timeoutMs) {
            let otpFound = null;
            let tsMsFound = null;
            await api.debugRedisOtp(phone, context, headers).then(res => {
                const { otp, tsMs } = parseOtp(res.data?.data);
                otpFound = otp;
                tsMsFound = tsMs;
            }).catch(() => { });
            const fresh = !sinceMs || (tsMsFound == null || tsMsFound >= sinceMs);
            if (otpFound && fresh) {
                if (otpFound !== lastOtp) {
                    logger?.debug("OTP_FOUND", { phone, otp: (0, log_1.maskOtp)(otpFound), tsMs: tsMsFound });
                }
                return otpFound;
            }
            lastOtp = null;
            await new Promise((r) => setTimeout(r, pollMs));
        }
        logger?.debug("OTP_TIMEOUT", { phone, timeoutMs });
        return null;
    }
    catch (e) {
        return null;
    }
}
async function loginWithOtpFlow(api, acc, headers, logger) {
    try {
        const phone = String(acc.phone || "").trim();
        const password = String(acc.password || "");
        (0, tokenStore_1.clearTokensForUser)(phone);
        const loginRes = await api.login(phone, password, headers);
        const loginData = loginRes.data?.data;
        if (!loginRes.data?.isSucceed) {
            const msg = String(loginRes.data?.message ?? "LOGIN_FAIL");
            if (msg !== "NEED_OTP" && !loginData?.otpRequired) {
                logger?.warn("LOGIN_FAIL", { msg });
                return { ok: false, reason: msg };
            }
        }
        if (loginData?.tokens || (loginData?.accessToken && loginData?.refreshToken)) {
            const tokens = (loginData.tokens || { accessToken: loginData.accessToken, refreshToken: loginData.refreshToken });
            const sDevice = headers["X-Device-Id"] || headers["x-device-id"];
            const sUa = headers["User-Agent"] || headers["user-agent"];
            (0, tokenStore_1.setStoredTokens)(phone, tokens.accessToken, tokens.refreshToken, sDevice, sUa);
            logger?.info("LOGIN_PASS_TOKEN_SUMMARY", { phone, deviceId: sDevice, userAgent: sUa, access: summarizeToken(tokens.accessToken), refresh: summarizeToken(tokens.refreshToken) });
            logger?.debug("LOGIN_PASS_SUCCESS", {});
            return { ok: true, tokens };
        }
        let sessionStartMs = Date.now();
        let failCount = 0;
        while (failCount < 2) {
            const deadline = sessionStartMs + env_1.ENV.VERIFY_WINDOW_MS;
            let otp = null;
            if (env_1.ENV.AUTO_FETCH_OTP) {
                const timeout = Math.min(env_1.ENV.OTP_TIMEOUT_MS, Math.max(500, deadline - Date.now()));
                otp = await waitForOtp(api, phone, { sinceMs: sessionStartMs, timeoutMs: timeout, logger, headers });
                if (!otp) {
                    logger?.debug("OTP_MISSING_FAST_FAIL", { phone });
                    return { ok: false, reason: "OTP_TIMEOUT" };
                }
            }
            if (!otp)
                return { ok: false, reason: "OTP_MISSING" };
            for (let i = 0; i < env_1.ENV.OTP_VERIFY_RETRY; i++) {
                const vr = await api.verifyLoginOtp(phone, otp, headers);
                if (vr.data?.isSucceed && vr.data?.data) {
                    const d = vr.data.data;
                    const tokens = (d.tokens || { accessToken: d.accessToken, refreshToken: d.refreshToken });
                    if (tokens?.accessToken) {
                        const sDevice = headers["X-Device-Id"] || headers["x-device-id"];
                        const sUa = headers["User-Agent"] || headers["user-agent"];
                        (0, tokenStore_1.setStoredTokens)(phone, tokens.accessToken, tokens.refreshToken, sDevice, sUa);
                        logger?.info("LOGIN_OTP_TOKEN_SUMMARY", { phone, deviceId: sDevice, userAgent: sUa, access: summarizeToken(tokens.accessToken), refresh: summarizeToken(tokens.refreshToken) });
                        logger?.debug("LOGIN_OTP_SUCCESS", {});
                        return { ok: true, tokens, usedOtp: otp };
                    }
                }
                await new Promise(r => setTimeout(r, 300));
            }
            logger?.warn("OTP_VERIFY_FAIL_RETRYING", { phone });
            if (!env_1.ENV.AUTO_RESEND || failCount >= env_1.ENV.MAX_RESEND)
                break;
            await api.resendLoginOtp(phone, headers);
            sessionStartMs = Date.now();
            failCount++;
        }
        return { ok: false, reason: "LOGIN_FAILED_FINAL" };
    }
    catch (e) {
        logger?.error("LOGIN_FLOW_ERROR", { phone: (0, log_1.maskOtp)(acc.phone || ""), err: e.message || String(e) });
        return { ok: false, reason: "CRASH" };
    }
}
async function ensureValidAccessToken(api, phone, deviceId, currentTokens, logger) {
    try {
        if (!currentTokens)
            return { ok: false, reason: "NO_TOKENS" };
        const { accessToken, refreshToken } = currentTokens;
        if (!(0, tokenUtils_1.isAccessExpired)(accessToken)) {
            return { ok: true, accessToken, reason: "ACCESS_OK" };
        }
        if ((0, tokenUtils_1.isRefreshExpired)(refreshToken)) {
            (0, tokenStore_1.clearAllData)();
            return { ok: false, reason: "REFRESH_EXPIRED" };
        }
        logger?.debug("REFRESHING", { phone });
        const newTokensFound = await api.refreshToken(refreshToken, (0, headers_1.buildHeaders)(deviceId, currentTokens.userAgent))
            .then(res => {
            const d = res.data?.data;
            if (d) {
                return (d.tokens || (d.accessToken ? { accessToken: d.accessToken, refreshToken: d.refreshToken } : null));
            }
            return null;
        })
            .catch(() => null);
        if (newTokensFound) {
            (0, tokenStore_1.setStoredTokens)(phone, newTokensFound.accessToken, newTokensFound.refreshToken, deviceId, currentTokens.userAgent);
            logger?.info("REFRESH_TOKEN_SUMMARY", { phone, deviceId, userAgent: currentTokens.userAgent, access: summarizeToken(newTokensFound.accessToken), refresh: summarizeToken(newTokensFound.refreshToken) });
            logger?.info("REFRESH_SUCCESS", {});
            return { ok: true, accessToken: newTokensFound.accessToken, refreshed: true };
        }
        (0, tokenStore_1.clearTokensForUser)(phone);
        return { ok: false, reason: "REFRESH_FAIL" };
    }
    catch (e) {
        (0, tokenStore_1.clearTokensForUser)(phone);
        return { ok: false, reason: "REFRESH_FAIL_CRASH" };
    }
}
async function getMeWithAutoAuth(api, phone, deviceId, logger, agent) {
    try {
        const stored = (0, tokenStore_1.getStoredTokens)(phone);
        const valid = await ensureValidAccessToken(api, phone, deviceId, stored, logger);
        if (!valid.ok || !valid.accessToken)
            return { ok: false, message: valid.reason };
        const headers = (0, headers_1.buildHeaders)(deviceId, stored?.userAgent);
        logger?.info("GET_ME_TOKEN_SUMMARY", { phone, deviceId, userAgent: stored?.userAgent, access: summarizeToken(valid.accessToken) });
        let returnData = null;
        let fallbackMessage = "ME_FAIL";
        await userApiService_1.UserApiService.getProfileMe(valid.accessToken, headers, agent)
            .then(res => {
            const d = res.data;
            if (d?.isSucceed && d?.data)
                returnData = { ok: true, data: d.data };
            else if (d?.data?.id || d?.data?.userName)
                returnData = { ok: true, data: d.data };
            else if (d?.id || d?.userName)
                returnData = { ok: true, data: d };
            else {
                logger?.info("GET_ME_FAILED_BODY", { phone, message: d?.message, data: d?.data });
            }
        })
            .catch((e) => {
            const errorData = e.response?.data;
            logger?.info("GET_ME_ERROR_DETAIL", { phone, error: e.message, status: e.response?.status, data: errorData });
        });
        if (returnData)
            return returnData;
        return { ok: false, message: fallbackMessage };
    }
    catch (e) {
        return { ok: false, message: "ME_FAIL_CRASH" };
    }
}
