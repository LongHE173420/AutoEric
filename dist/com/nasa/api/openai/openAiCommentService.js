"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiCommentService = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
class OpenAiCommentService {
    static getRawApiKey() {
        return String(env_1.ENV.OPENAI_API_KEY || "").trim();
    }
    static getDebugInfo() {
        const key = this.getRawApiKey();
        return {
            enabled: Boolean(key),
            keyPrefix: key ? key.slice(0, 7) : "",
            keySuffix: key ? key.slice(-4) : "",
            model: env_1.ENV.OPENAI_COMMENT_MODEL,
            timeoutMs: env_1.ENV.OPENAI_COMMENT_TIMEOUT_MS
        };
    }
    static sanitizeComment(value) {
        const cleaned = String(value || "")
            .replace(/[\r\n]+/g, " ")
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
        return cleaned.slice(0, 120);
    }
    static isEnabled() {
        return this.getDebugInfo().enabled;
    }
    static async generateComment(input) {
        if (!this.isEnabled()) {
            return "";
        }
        const postText = String(input.postText || "").slice(0, 700);
        const authorName = String(input.authorName || "").slice(0, 80);
        const response = await axios_1.default.post("https://api.openai.com/v1/chat/completions", {
            model: env_1.ENV.OPENAI_COMMENT_MODEL,
            temperature: 0.8,
            max_tokens: 40,
            messages: [
                {
                    role: "system",
                    content: [
                        "B\u1ea1n vi\u1ebft b\u00ecnh lu\u1eadn m\u1ea1ng x\u00e3 h\u1ed9i b\u1eb1ng ti\u1ebfng Vi\u1ec7t c\u00f3 d\u1ea5u, t\u1ef1 nhi\u00ean.",
                        "Ch\u1ec9 tr\u1ea3 v\u1ec1 \u0111\u00fang n\u1ed9i dung b\u00ecnh lu\u1eadn, kh\u00f4ng gi\u1ea3i th\u00edch.",
                        "B\u00ecnh lu\u1eadn ng\u1eafn 3-12 t\u1eeb, l\u1ecbch s\u1ef1, th\u00e2n thi\u1ec7n, kh\u00f4ng spam.",
                        "Kh\u00f4ng d\u00f9ng hashtag, kh\u00f4ng tag t\u00ean, kh\u00f4ng emoji, kh\u00f4ng d\u00f9ng d\u1ea5u ngo\u1eb7c k\u00e9p."
                    ].join(" ")
                },
                {
                    role: "user",
                    content: [
                        authorName ? `T\u00e1c gi\u1ea3: ${authorName}` : "",
                        postText ? `N\u1ed9i dung b\u00e0i vi\u1ebft: ${postText}` : "B\u00e0i vi\u1ebft kh\u00f4ng c\u00f3 caption r\u00f5 r\u00e0ng.",
                        "H\u00e3y t\u1ea1o m\u1ed9t b\u00ecnh lu\u1eadn ph\u00f9 h\u1ee3p b\u1eb1ng ti\u1ebfng Vi\u1ec7t c\u00f3 d\u1ea5u."
                    ].filter(Boolean).join("\n")
                }
            ]
        }, {
            timeout: env_1.ENV.OPENAI_COMMENT_TIMEOUT_MS,
            headers: {
                Authorization: `Bearer ${this.getRawApiKey()}`,
                "Content-Type": "application/json"
            }
        });
        const content = response.data?.choices?.[0]?.message?.content;
        return this.sanitizeComment(content || "");
    }
}
exports.OpenAiCommentService = OpenAiCommentService;
