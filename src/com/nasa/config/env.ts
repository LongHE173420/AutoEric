import dotenv from "dotenv";

dotenv.config();

type Bool = boolean;

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function str(name: string, def: string): string {
  const v = process.env[name];
  return v == null || v === "" ? def : String(v);
}

function bool(name: string, def: Bool): Bool {
  const v = process.env[name];
  if (v == null || v === "") return def;
  return String(v).toLowerCase() === "true" || String(v) === "1";
}

const defaultKongUrl = str("KONG_URL", "http://localhost:8000");
const legacySocialApiUrl = str("SOCIAL_API_URL", "");
const legacyPostApiUrl = str("POST_API_URL", "");
const legacySurfApiUrl = str("SURF_API_URL", "");
const legacyMediaApiUrl = str("MEDIA_API_URL", "");
const legacyMediaUploadApiUrl = str("MEDIA_UPLOAD_API_URL", "");
const defaultMediaApiUrl = firstNonEmpty(
  legacyMediaApiUrl,
  legacyMediaUploadApiUrl,
  legacySocialApiUrl,
  legacyPostApiUrl,
  legacySurfApiUrl,
  defaultKongUrl
);
const defaultMediaUploadApiUrls = str("MEDIA_UPLOAD_API_URLS", "");
const defaultUploadPublicBaseUrl = firstNonEmpty(
  str("UPLOAD_PUBLIC_BASE_URL", ""),
  defaultMediaApiUrl,
  "https://upload.eric.pro.vn"
);

export const ENV = {

  KONG_URL: defaultKongUrl,
  MEDIA_API_URL: defaultMediaApiUrl,
  MEDIA_UPLOAD_API_URLS: defaultMediaUploadApiUrls,
  UPLOAD_PUBLIC_BASE_URL: defaultUploadPublicBaseUrl,

  INTERVAL_MS: num("INTERVAL_MS", 600_000),
  RUN_ONCE: bool("RUN_ONCE", false),
  PROXY_REQUIRED: bool("PROXY_REQUIRED", false),
  LOGIN_CONCURRENCY: num("LOGIN_CONCURRENCY", 5),
  TARGETED_CONCURRENCY: num("TARGETED_CONCURRENCY", 5),
  ACCOUNT_FETCH_BATCH_SIZE: num("ACCOUNT_FETCH_BATCH_SIZE", 200),
  ACCOUNT_BATCH_SIZE: num("ACCOUNT_BATCH_SIZE", 50),
  ACCOUNT_BATCH_DELAY_MS: num("ACCOUNT_BATCH_DELAY_MS", 0),
  ACCOUNT_START_STAGGER_MS: num("ACCOUNT_START_STAGGER_MS", 0),
  ACCOUNT_DAILY_RUN_LIMIT: num("ACCOUNT_DAILY_RUN_LIMIT", 40),
  ACCOUNT_DAILY_POST_LIMIT: num("ACCOUNT_DAILY_POST_LIMIT", 3),
  ACCOUNT_DAILY_SURF_LIMIT: num("ACCOUNT_DAILY_SURF_LIMIT", 2),
  INTERACTION_MAX_REACTIONS_PER_RUN: num("INTERACTION_MAX_REACTIONS_PER_RUN", 2),
  ACCOUNT_ACTIVITY_PLANNER_ENABLED: bool("ACCOUNT_ACTIVITY_PLANNER_ENABLED", true),
  POST_MIN_GAP_RUNS: num("POST_MIN_GAP_RUNS", 4),
  SURF_MIN_GAP_RUNS: num("SURF_MIN_GAP_RUNS", 3),
  ALLOW_POST_AND_SURF_SAME_RUN: bool("ALLOW_POST_AND_SURF_SAME_RUN", false),
  POST_START_JITTER_MS: num("POST_START_JITTER_MS", 15_000),
  SURF_START_JITTER_MS: num("SURF_START_JITTER_MS", 10_000),
  REDIS_KEY_PREFIX: str("REDIS_KEY_PREFIX", "ae"),
  FEED_PAGE_DELAY_MS: num("FEED_PAGE_DELAY_MS", 300),
  FEED_PAGES: num("FEED_PAGES", 10),
  FEED_LIGHT_MODE_PAGES: num("FEED_LIGHT_MODE_PAGES", 12),
  SURF_HOME_DELAY_MS: num("SURF_HOME_DELAY_MS", 500),
  INTERACTION_ACTION_DELAY_MS: num("INTERACTION_ACTION_DELAY_MS", 250),
  POST_COMPLETE_SETTLE_MS: num("POST_COMPLETE_SETTLE_MS", 700),
  SURF_COMPLETE_SETTLE_MS: num("SURF_COMPLETE_SETTLE_MS", 700),
  VIDEO_CLAIM_TTL_MS: num("VIDEO_CLAIM_TTL_MS", 5 * 60_000),
  API_RETRY_BACKOFF_MS: num("API_RETRY_BACKOFF_MS", 1_500),

  DEVICE_ID: str("DEVICE_ID", ""),

  OTP_TIMEOUT_MS: num("OTP_TIMEOUT_MS", 30_000),
  OTP_POLL_MS: num("OTP_POLL_MS", 300),
  OTP_VERIFY_RETRY: num("OTP_VERIFY_RETRY", 5),
  VERIFY_WINDOW_MS: num("VERIFY_WINDOW_MS", 3 * 60_000),
  RESEND_WINDOW_MS: num("RESEND_WINDOW_MS", 2 * 60_000),
  MAX_RESEND: num("MAX_RESEND", 2),

  AUTO_FETCH_OTP: bool("AUTO_FETCH_OTP", true),
  AUTO_RESEND: bool("AUTO_RESEND", true),

  OTP_DEBUG_PATH_REDIS: str("OTP_DEBUG_PATH_REDIS", "/auth/debug/redis-otp"),

  UPSTASH_REDIS_REST_URL: str("UPSTASH_REDIS_REST_URL", ""),
  UPSTASH_REDIS_REST_TOKEN: str("UPSTASH_REDIS_REST_TOKEN", ""),

  ACCESS_TTL_MS: num("ACCESS_TTL_MS", 60_000),
  REFRESH_TTL_MS: num("REFRESH_TTL_MS", 10 * 60_000),

  LOG_LEVEL: str("LOG_LEVEL", "debug"),
  LOG_CONSOLE: bool("LOG_CONSOLE", false),
  LOG_VERBOSE: bool("LOG_VERBOSE", false),
  LOG_HTTP: bool("LOG_HTTP", false),
  LOG_DIR: str("LOG_DIR", "data/logs"),
  LOG_RETENTION_DAYS: num("LOG_RETENTION_DAYS", 7),

  LOG_OTP_PLAINTEXT: bool("LOG_OTP_PLAINTEXT", false),
  LOG_PASSWORD_PLAINTEXT: bool("LOG_PASSWORD_PLAINTEXT", false),

  DB_HOST: str("DB_HOST", "127.0.0.1"),
  DB_PORT: num("DB_PORT", 3306),
  DB_USER: str("DB_USER", "admin"),
  DB_PASS: str("DB_PASS", "123456"),
  DB_NAME: str("DB_NAME", "auth_service"),

};

export type Env = typeof ENV;
