"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startService = startService;
const env_1 = require("./com/nasa/config/env");
const log_1 = require("./com/nasa/utils/log");
const openAiCommentService_1 = require("./com/nasa/api/openai/openAiCommentService");
const axios_1 = __importDefault(require("axios"));
const axiosSignature_1 = require("./com/nasa/utils/axiosSignature");
const ProxyManager_1 = require("./com/nasa/proxy/ProxyManager");
const mysqlStore_1 = require("./com/nasa/data/mysqlStore");
(0, axiosSignature_1.applyStandardInterceptors)(axios_1.default, "global-system");
let isRunning = false;
let started = false;
const proxyManager = new ProxyManager_1.ProxyManager();
async function runOnce(reason) {
    if (isRunning)
        return;
    isRunning = true;
    try {
        (0, log_1.cleanupOldLogs)();
        const { filePath } = (0, log_1.getTodayLogPath)();
        log_1.Log.init({ filePath, level: env_1.ENV.LOG_LEVEL });
        const logger = log_1.Log.getLogger("LoginService");
        if (!started) {
            started = true;
            logger.debug("Service_CONFIG", {
                config: {
                    KONG_URL: env_1.ENV.KONG_URL,
                    MEDIA_API_URL: env_1.ENV.MEDIA_API_URL,
                    MEDIA_UPLOAD_API_URLS: env_1.ENV.MEDIA_UPLOAD_API_URLS,
                    UPLOAD_PUBLIC_BASE_URL: env_1.ENV.UPLOAD_PUBLIC_BASE_URL,
                    INTERVAL_MS: env_1.ENV.INTERVAL_MS,
                    RUN_ONCE: env_1.ENV.RUN_ONCE,
                    PROXY_REQUIRED: env_1.ENV.PROXY_REQUIRED,
                    LOGIN_CONCURRENCY: env_1.ENV.LOGIN_CONCURRENCY,
                    ACCOUNT_FETCH_BATCH_SIZE: env_1.ENV.ACCOUNT_FETCH_BATCH_SIZE,
                    ACCOUNT_BATCH_SIZE: env_1.ENV.ACCOUNT_BATCH_SIZE,
                    ACCOUNT_BATCH_DELAY_MS: env_1.ENV.ACCOUNT_BATCH_DELAY_MS,
                    ACCOUNT_START_STAGGER_MS: env_1.ENV.ACCOUNT_START_STAGGER_MS,
                    VIDEO_CLAIM_TTL_MS: env_1.ENV.VIDEO_CLAIM_TTL_MS,
                    API_RETRY_BACKOFF_MS: env_1.ENV.API_RETRY_BACKOFF_MS,
                    AUTO_FETCH_OTP: env_1.ENV.AUTO_FETCH_OTP,
                    AUTO_RESEND: env_1.ENV.AUTO_RESEND,
                    OTP_TIMEOUT_MS: env_1.ENV.OTP_TIMEOUT_MS,
                    OTP_POLL_MS: env_1.ENV.OTP_POLL_MS,
                    OTP_VERIFY_RETRY: env_1.ENV.OTP_VERIFY_RETRY,
                    VERIFY_WINDOW_MS: env_1.ENV.VERIFY_WINDOW_MS,
                    RESEND_WINDOW_MS: env_1.ENV.RESEND_WINDOW_MS,
                    MAX_RESEND: env_1.ENV.MAX_RESEND,
                    OTP_DEBUG_PATH_REDIS: env_1.ENV.OTP_DEBUG_PATH_REDIS,
                    LOG_LEVEL: env_1.ENV.LOG_LEVEL,
                    LOG_VERBOSE: env_1.ENV.LOG_VERBOSE,
                    UPSTASH_REDIS_REST_URL: env_1.ENV.UPSTASH_REDIS_REST_URL ? "[configured]" : "",
                    UPSTASH_REDIS_REST_TOKEN: env_1.ENV.UPSTASH_REDIS_REST_TOKEN ? "[configured]" : "",
                    OPENAI: openAiCommentService_1.OpenAiCommentService.getDebugInfo()
                }
            });
        }
        logger.debug("JOB_START", { reason });
        const { MasterWorker } = await Promise.resolve().then(() => __importStar(require("./com/nasa/worker/MasterWorker")));
        const master = new MasterWorker(logger);
        let lastSeenId = 0;
        let loadedAccounts = 0;
        const summary = {
            success: 0,
            alreadyOk: 0,
            relogin: 0,
            fail: 0,
            accounts: 0,
        };
        while (true) {
            const dbAccounts = await (0, mysqlStore_1.getAccountsBatchFromDb)(lastSeenId, env_1.ENV.ACCOUNT_FETCH_BATCH_SIZE);
            if (!dbAccounts.length) {
                break;
            }
            const accountsInfo = [];
            for (const acc of dbAccounts) {
                lastSeenId = Math.max(lastSeenId, Number(acc.id || 0));
                accountsInfo.push({
                    phone: acc.phone,
                    password: acc.password,
                    deviceId: acc.deviceId,
                    userAgent: acc.userAgent,
                    accessToken: acc.accessToken,
                    refreshToken: acc.refreshToken,
                });
            }
            loadedAccounts += accountsInfo.length;
            logger.debug("ACCOUNTS_PAGE_LOADED", {
                pageSize: accountsInfo.length,
                loadedAccounts,
                lastSeenId
            });
            const pageSummary = await master.run(accountsInfo, proxyManager);
            summary.success += pageSummary.success;
            summary.alreadyOk += pageSummary.alreadyOk;
            summary.relogin += pageSummary.relogin;
            summary.fail += pageSummary.fail;
            summary.accounts += pageSummary.accounts;
        }
        logger.debug(`Loaded ${loadedAccounts} accounts from database.`);
        logger.debug("JOB_DONE", { summary });
        const msg = `LOGIN summary: success=${summary.success} alreadyOk=${summary.alreadyOk} relogin=${summary.relogin} fail=${summary.fail}`;
        logger.info(msg);
        console.log(msg);
    }
    catch (err) {
        const { filePath } = (0, log_1.getTodayLogPath)();
        log_1.Log.init({ filePath, level: env_1.ENV.LOG_LEVEL });
        const logger = log_1.Log.getLogger("LoginService");
        logger.error("JOB_CRASH", { reason, err: err?.message ?? String(err) });
        const msg = "LOGIN summary: success=0 alreadyOk=0 relogin=0 fail=0";
        logger.info(msg);
        console.log(msg);
    }
    finally {
        isRunning = false;
    }
}
async function startService() {
    try {
        const { filePath } = (0, log_1.getTodayLogPath)();
        log_1.Log.init({ filePath, level: env_1.ENV.LOG_LEVEL });
        await runOnce("startup");
        if (!env_1.ENV.RUN_ONCE) {
            setInterval(() => runOnce("interval"), env_1.ENV.INTERVAL_MS);
        }
    }
    catch (e) {
        console.error("Service startup fail", e);
    }
}
