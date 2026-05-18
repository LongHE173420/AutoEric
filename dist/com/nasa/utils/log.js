"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
exports.maskSecret = maskSecret;
exports.maskPassword = maskPassword;
exports.maskOtp = maskOtp;
exports.maskToken = maskToken;
exports.ensureLogDir = ensureLogDir;
exports.getTodayLogPath = getTodayLogPath;
exports.cleanupOldLogs = cleanupOldLogs;
const pino_1 = __importDefault(require("pino"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
// --- LOG MASKING UTILS ---
function maskSecret(s, allowPlaintext, label) {
    const v = String(s ?? "");
    if (allowPlaintext)
        return v;
    const len = v.length;
    const tag = label ? `${label}` : "***";
    return `${tag}len=${len}`;
}
function maskPassword(pw) {
    return maskSecret(pw, env_1.ENV.LOG_PASSWORD_PLAINTEXT, "***");
}
function maskOtp(otp) {
    return maskSecret(otp, env_1.ENV.LOG_OTP_PLAINTEXT, "***");
}
function maskToken(token) {
    if (!token)
        return "";
    const t = String(token);
    if (t.length <= 12)
        return "***";
    return `${t.slice(0, 8)}...${t.slice(-6)}`;
}
// --- LOG FILE UTILS ---
function ensureLogDir() {
    const dir = path_1.default.resolve(process.cwd(), env_1.ENV.LOG_DIR);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function getTodayLogPath() {
    const dir = ensureLogDir();
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const fileName = `login-worker-${yyyy}-${mm}-${dd}.log`;
    const filePath = path_1.default.join(dir, fileName);
    return { fileName, filePath };
}
function tryDeleteLog(fp, cutoff) {
    try {
        if (!fs_1.default.existsSync(fp))
            return;
        const st = fs_1.default.statSync(fp);
        if (!st.isFile())
            return;
        if (st.mtimeMs < cutoff)
            fs_1.default.rmSync(fp, { force: true });
    }
    catch {
        // ignore
    }
}
function cleanupOldLogs() {
    const dir = ensureLogDir();
    const days = env_1.ENV.LOG_RETENTION_DAYS;
    if (!Number.isFinite(days) || days <= 0)
        return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
        for (const name of fs_1.default.readdirSync(dir)) {
            tryDeleteLog(path_1.default.join(dir, name), cutoff);
        }
    }
    catch (e) {
    }
}
const multistream = pino_1.default.multistream;
function pad(value, length = 2) {
    return String(Math.trunc(Math.abs(value))).padStart(length, "0");
}
function getLocalIsoTimestamp() {
    const d = new Date();
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    const millis = pad(d.getMilliseconds(), 3);
    const offsetMinutes = -d.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
    const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetRemainder}`;
}
class Log {
    static shouldWriteToFile(msg) {
        return !((msg.endsWith("_PRESIGNED_REQUEST") || msg.endsWith("_PRESIGNED_RESPONSE")));
    }
    static compactForFile(msg, obj) {
        if (!obj || typeof obj !== "object")
            return obj;
        const clone = { ...obj };
        const keepPayload = msg === "VIDEO_POST_CREATE_REQUEST"
            || msg === "VIDEO_POST_COMPLETE_REQUEST"
            || msg.endsWith("_PRESIGNED_REQUEST_FAILED");
        const keepHttpDebug = msg === "VIDEO_THUMBNAIL_UPLOAD_FAILED"
            || msg.endsWith("_DIRECT_UPLOAD_FAILED")
            || msg.endsWith("_PRESIGNED_REQUEST_FAILED")
            || msg.endsWith("_S3_UPLOAD_FAILED")
            || msg.startsWith("MISSION_IGNORED");
        if (!keepPayload) {
            delete clone.payload;
        }
        delete clone.responseData;
        if (!msg.endsWith("_S3_UPLOAD_FAILED")) {
            delete clone.uploadFields;
        }
        if (!keepHttpDebug) {
            delete clone.requestDebug;
            delete clone.requestHeaders;
            delete clone.responseHeaders;
        }
        if (clone.detail && typeof clone.detail === "object") {
            clone.detail = "[object]";
        }
        return clone;
    }
    static init(opts) {
        if (this.initialized)
            return;
        this.baseConfig = {
            level: opts?.level ?? process.env.LOG_LEVEL,
            base: {
                app: opts?.appName,
            },
            formatters: {
                level: (label, number) => ({
                    level: label.toUpperCase(),
                    levelValue: number
                })
            },
            timestamp: () => `,"time":"${getLocalIsoTimestamp()}"`,
        };
        if (opts?.filePath) {
            this.fileLoggingEnabled = true;
            this.configuredFilePath = opts.filePath;
            if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
                this.consoleStream = pino_1.default.destination(1);
                this.consoleRoot = (0, pino_1.default)(this.baseConfig, this.consoleStream);
            }
            this.rotateFileLogger(opts.filePath);
        }
        else {
            if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
                this.consoleRoot = (0, pino_1.default)(this.baseConfig);
                this.root = this.consoleRoot;
            }
            else {
                this.root = (0, pino_1.default)({ ...this.baseConfig, level: "silent" });
            }
        }
        this.initialized = true;
    }
    static ensureFileExists(filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.writeFileSync(filePath, "\uFEFF");
            }
            catch (e) {
                // ignore
            }
        }
    }
    static rotateFileLogger(filePath) {
        this.ensureFileExists(filePath);
        const nextFileStream = pino_1.default.destination({ dest: filePath, sync: false });
        const nextFileRoot = (0, pino_1.default)(this.baseConfig, nextFileStream);
        const streams = [{ stream: nextFileStream }];
        if (this.consoleStream) {
            streams.push({ stream: this.consoleStream });
        }
        const previousFileStream = this.fileStream;
        this.fileStream = nextFileStream;
        this.fileRoot = nextFileRoot;
        this.configuredFilePath = filePath;
        this.root = (0, pino_1.default)(this.baseConfig, multistream(streams));
        if (previousFileStream && previousFileStream !== nextFileStream) {
            try {
                previousFileStream.flushSync?.();
            }
            catch (e) {
                // ignore
            }
            try {
                previousFileStream.end?.();
            }
            catch (e) {
                // ignore
            }
        }
    }
    static ensureDailyFileRotation() {
        if (!this.fileLoggingEnabled)
            return;
        const { filePath } = getTodayLogPath();
        if (this.configuredFilePath === filePath && this.fileRoot)
            return;
        this.rotateFileLogger(filePath);
    }
    static getLogger(name) {
        if (!this.initialized) {
            this.init();
        }
        const write = (level, msg, obj) => {
            this.ensureDailyFileRotation();
            const logger = this.root.child({ logger: name });
            const consoleLogger = this.consoleRoot?.child({ logger: name });
            const fileLogger = this.fileRoot?.child({ logger: name });
            const payload = {
                ...(obj || {}),
                event: obj?.event || msg
            };
            if (consoleLogger) {
                consoleLogger[level](payload, msg);
            }
            else if (!fileLogger) {
                logger[level](payload, msg);
            }
            if (fileLogger && this.shouldWriteToFile(msg)) {
                fileLogger[level](this.compactForFile(msg, payload) || {}, msg);
            }
        };
        return {
            debug: (msg, obj) => write("debug", msg, obj),
            info: (msg, obj) => write("info", msg, obj),
            warn: (msg, obj) => write("warn", msg, obj),
            error: (msg, obj) => write("error", msg, obj),
        };
    }
}
exports.Log = Log;
Log.fileLoggingEnabled = false;
Log.initialized = false;
