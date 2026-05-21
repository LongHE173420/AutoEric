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
    static truncateComment(value) {
        if (value.length <= this.maxCommentChars) {
            return value;
        }
        const sentenceEnd = value.slice(0, this.maxCommentChars + 1).search(/[.!?。！？](?=\s|$)/);
        if (sentenceEnd >= 20) {
            return value.slice(0, sentenceEnd + 1).trim();
        }
        const sliced = value.slice(0, this.maxCommentChars + 1);
        const lastSpace = sliced.lastIndexOf(" ");
        const truncated = (lastSpace >= 30 ? sliced.slice(0, lastSpace) : value.slice(0, this.maxCommentChars))
            .replace(/[,\-:;]+$/g, "")
            .trim();
        return truncated;
    }
    static sanitizeComment(value) {
        const cleaned = String(value || "")
            .replace(/[\r\n]+/g, " ")
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
        return this.truncateComment(cleaned);
    }
    static normalizeVietnamese(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D")
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }
    static isGenericComment(value) {
        const normalized = this.normalizeVietnamese(value);
        if (!normalized)
            return true;
        return this.genericCommentPatterns.some((pattern) => pattern.test(normalized));
    }
    static acceptGeneratedComment(value) {
        const normalized = this.sanitizeComment(value);
        if (!normalized || this.isGenericComment(normalized)) {
            return "";
        }
        return normalized;
    }
    static isEnabled() {
        return this.getDebugInfo().enabled;
    }
    static getLastResponseMeta() {
        return this.lastResponseMeta;
    }
    static buildSystemPrompt() {
        return [
            "Ban viet binh luan mang xa hoi bang tieng Viet co dau, tu nhien.",
            "Chi tra ve dung noi dung binh luan, khong giai thich.",
            "Binh luan ngan 5-12 tu, duoi 80 ky tu, lich su, than thien, khong spam.",
            "Moi binh luan phai bam sat mot chi tiet cu the trong bai viet.",
            "Khong viet cau dai, khong giai thich, khong them y ngoai noi dung bai.",
            "Khong viet cau chung chung nhu: Hay qua, Tuyet voi, Bai viet hay qua, Cam on ban da chia se, Rat y nghia.",
            "Khong dung hashtag, khong tag ten, khong emoji, khong dung dau ngoac kep."
        ].join(" ");
    }
    static buildUserPrompt(input) {
        const postText = String(input.postText || "").trim().slice(0, 700);
        const authorName = String(input.authorName || "").slice(0, 80);
        return [
            authorName ? `Tac gia: ${authorName}` : "",
            `Noi dung bai viet: ${postText}`,
            "Hay tao mot binh luan phu hop bang tieng Viet co dau, toi da 1 cau ngan.",
            "Binh luan phai duoi 80 ky tu va khong bi bo lung cau.",
            "Neu bai viet qua it noi dung de binh luan cu the, van hay viet tu nhien nhung tranh cac cau template."
        ].filter(Boolean).join("\n");
    }
    static extractTextParts(value) {
        if (typeof value === "string") {
            return [value];
        }
        if (!value || typeof value !== "object") {
            return [];
        }
        if (Array.isArray(value)) {
            return value.flatMap((item) => this.extractTextParts(item));
        }
        const result = [];
        if (typeof value.text === "string") {
            result.push(value.text);
        }
        if (typeof value.content === "string") {
            result.push(value.content);
        }
        else if (Array.isArray(value.content)) {
            result.push(...value.content.flatMap((item) => this.extractTextParts(item)));
        }
        return result;
    }
    static extractTextFromPayload(data) {
        const candidates = [];
        candidates.push(...this.extractTextParts(data?.output_text));
        if (Array.isArray(data?.output)) {
            for (const item of data.output) {
                candidates.push(...this.extractTextParts(item?.content));
            }
        }
        if (Array.isArray(data?.choices)) {
            for (const choice of data.choices) {
                candidates.push(...this.extractTextParts(choice?.message?.content));
                candidates.push(...this.extractTextParts(choice?.text));
            }
        }
        for (const candidate of candidates) {
            const normalized = this.acceptGeneratedComment(candidate);
            if (normalized) {
                return normalized;
            }
        }
        return "";
    }
    static summarizePayload(source, data, text) {
        return {
            source,
            id: data?.id || "",
            model: data?.model || "",
            textLength: text.length,
            outputCount: Array.isArray(data?.output) ? data.output.length : 0,
            choiceCount: Array.isArray(data?.choices) ? data.choices.length : 0,
            finishReason: data?.choices?.[0]?.finish_reason || "",
            refusal: data?.choices?.[0]?.message?.refusal || ""
        };
    }
    static summarizeError(source, error) {
        return {
            source,
            err: error?.message || String(error),
            status: error?.response?.status,
            data: error?.response?.data
        };
    }
    static async generateComment(input) {
        if (!this.isEnabled()) {
            return "";
        }
        const postText = String(input.postText || "").trim().slice(0, 700);
        const authorName = String(input.authorName || "").slice(0, 80);
        if (!postText) {
            return "";
        }
        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(input);
        const headers = {
            Authorization: `Bearer ${this.getRawApiKey()}`,
            "Content-Type": "application/json"
        };
        const attempts = [];
        let lastError = null;
        try {
            const response = await axios_1.default.post("https://api.openai.com/v1/responses", {
                model: env_1.ENV.OPENAI_COMMENT_MODEL,
                temperature: 0.8,
                max_output_tokens: 28,
                input: [
                    {
                        role: "developer",
                        content: [
                            { type: "input_text", text: systemPrompt }
                        ]
                    },
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: userPrompt }
                        ]
                    }
                ]
            }, {
                timeout: env_1.ENV.OPENAI_COMMENT_TIMEOUT_MS,
                headers
            });
            const text = this.extractTextFromPayload(response.data);
            attempts.push(this.summarizePayload("responses", response.data, text));
            if (text) {
                this.lastResponseMeta = { attempts };
                return text;
            }
        }
        catch (error) {
            lastError = error;
            attempts.push(this.summarizeError("responses", error));
        }
        try {
            const response = await axios_1.default.post("https://api.openai.com/v1/chat/completions", {
                model: env_1.ENV.OPENAI_COMMENT_MODEL,
                temperature: 0.8,
                max_tokens: 28,
                messages: [
                    {
                        role: "developer",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ]
            }, {
                timeout: env_1.ENV.OPENAI_COMMENT_TIMEOUT_MS,
                headers
            });
            const text = this.extractTextFromPayload(response.data);
            attempts.push(this.summarizePayload("chat.completions", response.data, text));
            this.lastResponseMeta = { attempts };
            if (text) {
                return text;
            }
        }
        catch (error) {
            lastError = error;
            attempts.push(this.summarizeError("chat.completions", error));
        }
        this.lastResponseMeta = { attempts };
        if (attempts.length > 0 && attempts.every((attempt) => attempt?.status || attempt?.err)) {
            throw lastError;
        }
        return "";
    }
}
exports.OpenAiCommentService = OpenAiCommentService;
OpenAiCommentService.lastResponseMeta = null;
OpenAiCommentService.maxCommentChars = 90;
OpenAiCommentService.genericCommentPatterns = [
    /^hay qua[.!?]*$/i,
    /^tuyet voi[.!?]*$/i,
    /^bai viet hay qua[.!?]*$/i,
    /^cam on ban da chia se[.!?]*$/i,
    /^rat y nghia[.!?]*$/i,
    /^that thu vi[.!?]*$/i,
    /^qua tuyet voi[.!?]*$/i,
    /^noi dung rat hay[.!?]*$/i
];
