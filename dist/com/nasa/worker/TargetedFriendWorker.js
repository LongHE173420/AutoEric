"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetedFriendWorker = void 0;
const authApiService_1 = require("../api/auth/authApiService");
const tokenStore_1 = require("../storage/tokenStore");
const LoginFlowService_1 = require("../service/auth/LoginFlowService");
const mysqlStore_1 = require("../data/mysqlStore");
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const headers_1 = require("../utils/headers");
const ProxyHelper_1 = require("../proxy/ProxyHelper");
const userApiService_1 = require("../api/user/userApiService");
const friendApiService_1 = require("../api/friend/friendApiService");
class TargetedFriendWorker {
    constructor(acc, parentLogger, rowNo, proxyManager) {
        this.acc = acc;
        this.rowNo = rowNo;
        this.proxyManager = proxyManager;
        this.logger = parentLogger;
        this.proxyHelper = new ProxyHelper_1.ProxyHelper(this.acc, this.proxyManager, this.logger);
        const activeDeviceId = this.acc.deviceId || (0, uuid_1.v4)();
        this.acc.deviceId = activeDeviceId;
        this.api = new authApiService_1.AuthServiceApi(activeDeviceId, env_1.ENV.KONG_URL, this.proxyHelper.proxyAgent);
    }
    logContext() {
        return { row: this.rowNo, phone: String(this.acc.phone || "").trim() };
    }
    async run() {
        const ctx = this.logContext();
        try {
            const phone = String(this.acc.phone || this.acc.username || "").trim();
            const password = String(this.acc.password || "").trim();
            if (!phone || !password)
                return { success: false, reason: "INVALID_CREDENTIALS" };
            // 1. Auth / Login
            const accessToken = await this.ensureAuth(phone, password, ctx);
            if (!accessToken)
                return { success: false, reason: "AUTH_FAILED" };
            // 2. Targeted Task
            await this.sendFriendRequest(accessToken, "tieucong.thang@gmail.com", ctx);
            return { success: true };
        }
        catch (e) {
            this.logger.error("TARGETED_WORKER_ERROR", { ...ctx, err: e.message });
            return { success: false, reason: e.message };
        }
    }
    async ensureAuth(phone, password, ctx) {
        const stored = (0, tokenStore_1.getStoredTokens)(phone);
        const activeDeviceId = this.acc.deviceId || stored?.deviceId || (0, uuid_1.v4)();
        if (stored) {
            const me = await (0, LoginFlowService_1.getMeWithAutoAuth)(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
            if (me.ok) {
                return (0, tokenStore_1.getStoredTokens)(phone)?.accessToken || stored.accessToken;
            }
            (0, tokenStore_1.clearTokensForUser)(phone);
        }
        const headers = (0, headers_1.buildHeaders)(activeDeviceId, this.acc.userAgent);
        const lr = await (0, LoginFlowService_1.loginWithOtpFlow)(this.api, { phone, password }, headers, this.logger);
        if (lr.ok && lr.tokens?.accessToken) {
            const final = (0, tokenStore_1.getStoredTokens)(phone);
            if (final) {
                await (0, mysqlStore_1.saveTokensToDb)(phone, final.accessToken, final.refreshToken).catch(() => { });
                return final.accessToken;
            }
        }
        return null;
    }
    async sendFriendRequest(accessToken, targetEmail, ctx) {
        try {
            const h = (0, headers_1.buildHeaders)(this.acc.deviceId, this.acc.userAgent);
            // Resolve email to ID
            this.logger.info("FINDING_TARGET_USER", { ...ctx, targetEmail });
            const res = await userApiService_1.UserApiService.getProfileByUsername(accessToken, targetEmail, h, this.proxyHelper.proxyAgent);
            const userData = res.data?.data || res.data;
            const targetId = userData?.id || userData?.userId || userData?.accountId;
            if (!targetId) {
                this.logger.warn("TARGET_USER_NOT_FOUND", { ...ctx, targetEmail });
                return;
            }
            // Send request
            this.logger.info("SENDING_FRIEND_REQUEST", { ...ctx, targetEmail, targetId });
            await friendApiService_1.FriendApiService.sendFriendRequest(accessToken, String(targetId), h, this.proxyHelper.proxyAgent)
                .then(() => {
                this.logger.info("FRIEND_REQUEST_SENT_SUCCESS", { ...ctx, targetEmail });
            })
                .catch((e) => {
                const status = e.response?.status;
                if (status === 409) {
                    this.logger.info("FRIEND_REQUEST_ALREADY_EXISTS", { ...ctx, targetEmail });
                }
                else {
                    this.logger.error("SEND_FRIEND_REQUEST_FAILED", { ...ctx, targetEmail, status, err: e.message });
                }
            });
        }
        catch (e) {
            this.logger.error("PROCESS_FRIEND_REQUEST_ERROR", { ...ctx, targetEmail, err: e.message });
        }
    }
}
exports.TargetedFriendWorker = TargetedFriendWorker;
