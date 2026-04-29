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
    static getLastResponseMeta() {
        return this.lastResponseMeta;
    }
    static buildSystemPrompt() {
        return [
            "Ban viet binh luan mang xa hoi bang tieng Viet co dau, tu nhien.",
            "Chi tra ve dung noi dung binh luan, khong giai thich.",
            "Binh luan ngan 3-12 tu, lich su, than thien, khong spam.",
            "Khong dung hashtag, khong tag ten, khong emoji, khong dung dau ngoac kep."
        ].join(" ");
    }
    static buildUserPrompt(input) {
        const postText = String(input.postText || "").trim().slice(0, 700);
        const authorName = String(input.authorName || "").slice(0, 80);
        return [
            authorName ? `Tac gia: ${authorName}` : "",
            `Noi dung bai viet: ${postText}`,
            "Hay tao mot binh luan phu hop bang tieng Viet co dau."
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
            const normalized = this.sanitizeComment(candidate);
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
                max_output_tokens: 40,
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
                max_tokens: 40,
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
