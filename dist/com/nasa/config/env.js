"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function num(name, def) {
    const v = process.env[name];
    if (v == null || v === "")
        return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}
function str(name, def) {
    const v = process.env[name];
    return v == null || v === "" ? def : String(v);
}
function bool(name, def) {
    const v = process.env[name];
    if (v == null || v === "")
        return def;
    return String(v).toLowerCase() === "true" || String(v) === "1";
}
const defaultKongUrl = str("KONG_URL", "http://localhost:8000");
const defaultSocialApiUrl = str("SOCIAL_API_URL", defaultKongUrl);
const defaultPostApiUrl = str("POST_API_URL", defaultSocialApiUrl);
const defaultSurfApiUrl = str("SURF_API_URL", defaultSocialApiUrl);
const defaultMediaApiUrl = str("MEDIA_API_URL", defaultSocialApiUrl);
const defaultMediaUploadApiUrl = str("MEDIA_UPLOAD_API_URL", defaultSocialApiUrl);
const defaultMediaUploadApiUrls = str("MEDIA_UPLOAD_API_URLS", "");
const defaultUploadPublicBaseUrl = str("UPLOAD_PUBLIC_BASE_URL", defaultSocialApiUrl || "https://upload.eric.pro.vn");
exports.ENV = {
    KONG_URL: defaultKongUrl,
    SOCIAL_API_URL: defaultSocialApiUrl,
    POST_API_URL: defaultPostApiUrl,
    SURF_API_URL: defaultSurfApiUrl,
    MEDIA_API_URL: defaultMediaApiUrl,
    MEDIA_UPLOAD_API_URL: defaultMediaUploadApiUrl,
    MEDIA_UPLOAD_API_URLS: defaultMediaUploadApiUrls,
    UPLOAD_PUBLIC_BASE_URL: defaultUploadPublicBaseUrl,
    INTERVAL_MS: num("INTERVAL_MS", 60000),
    RUN_ONCE: bool("RUN_ONCE", false),
    PROXY_REQUIRED: bool("PROXY_REQUIRED", false),
    LOGIN_CONCURRENCY: num("LOGIN_CONCURRENCY", 5),
    TARGETED_CONCURRENCY: num("TARGETED_CONCURRENCY", 5),
    ACCOUNT_FETCH_BATCH_SIZE: num("ACCOUNT_FETCH_BATCH_SIZE", 200),
    ACCOUNT_BATCH_SIZE: num("ACCOUNT_BATCH_SIZE", 50),
    ACCOUNT_BATCH_DELAY_MS: num("ACCOUNT_BATCH_DELAY_MS", 1500),
    ACCOUNT_START_STAGGER_MS: num("ACCOUNT_START_STAGGER_MS", 150),
    VIDEO_CLAIM_TTL_MS: num("VIDEO_CLAIM_TTL_MS", 5 * 60000),
    API_RETRY_BACKOFF_MS: num("API_RETRY_BACKOFF_MS", 1500),
    DEVICE_ID: str("DEVICE_ID", ""),
    OTP_TIMEOUT_MS: num("OTP_TIMEOUT_MS", 30000),
    OTP_POLL_MS: num("OTP_POLL_MS", 300),
    OTP_VERIFY_RETRY: num("OTP_VERIFY_RETRY", 5),
    VERIFY_WINDOW_MS: num("VERIFY_WINDOW_MS", 3 * 60000),
    RESEND_WINDOW_MS: num("RESEND_WINDOW_MS", 2 * 60000),
    MAX_RESEND: num("MAX_RESEND", 2),
    AUTO_FETCH_OTP: bool("AUTO_FETCH_OTP", true),
    AUTO_RESEND: bool("AUTO_RESEND", true),
    OTP_DEBUG_PATH_REDIS: str("OTP_DEBUG_PATH_REDIS", "/auth/debug/redis-otp"),
    UPSTASH_REDIS_REST_URL: str("UPSTASH_REDIS_REST_URL", ""),
    UPSTASH_REDIS_REST_TOKEN: str("UPSTASH_REDIS_REST_TOKEN", ""),
    OPENAI_API_KEY: str("OPENAI_API_KEY", ""),
    OPENAI_COMMENT_MODEL: str("OPENAI_COMMENT_MODEL", "gpt-4o-mini"),
    OPENAI_COMMENT_TIMEOUT_MS: num("OPENAI_COMMENT_TIMEOUT_MS", 10000),
    ACCESS_TTL_MS: num("ACCESS_TTL_MS", 60000),
    REFRESH_TTL_MS: num("REFRESH_TTL_MS", 10 * 60000),
    LOG_LEVEL: str("LOG_LEVEL", "debug"),
    LOG_CONSOLE: bool("LOG_CONSOLE", false),
    LOG_VERBOSE: bool("LOG_VERBOSE", false),
    LOG_HTTP: bool("LOG_HTTP", false),
    LOG_DIR: str("LOG_DIR", "data/logs"),
    LOG_RETENTION_DAYS: num("LOG_RETENTION_DAYS", 7),
    LOG_OTP_PLAINTEXT: bool("LOG_OTP_PLAINTEXT", false),
    LOG_PASSWORD_PLAINTEXT: bool("LOG_PASSWORD_PLAINTEXT", false),
    DB_HOST: str("DB_HOST", "127.0.0.1"),
    DB_USER: str("DB_USER", "admin"),
    DB_PASS: str("DB_PASS", "123456"),
    DB_NAME: str("DB_NAME", "auth_service"),
};
