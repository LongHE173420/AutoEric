import axios from "axios";
import { ENV } from "../../config/env";

export class OpenAiCommentService {
    private static lastResponseMeta: any = null;

    private static getRawApiKey() {
        return String(ENV.OPENAI_API_KEY || "").trim();
    }

    static getDebugInfo() {
        const key = this.getRawApiKey();
        return {
            enabled: Boolean(key),
            keyPrefix: key ? key.slice(0, 7) : "",
            keySuffix: key ? key.slice(-4) : "",
            model: ENV.OPENAI_COMMENT_MODEL,
            timeoutMs: ENV.OPENAI_COMMENT_TIMEOUT_MS
        };
    }

    private static sanitizeComment(value: string) {
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

    private static buildSystemPrompt() {
        return [
            "Ban viet binh luan mang xa hoi bang tieng Viet co dau, tu nhien.",
            "Chi tra ve dung noi dung binh luan, khong giai thich.",
            "Binh luan ngan 3-12 tu, lich su, than thien, khong spam.",
            "Khong dung hashtag, khong tag ten, khong emoji, khong dung dau ngoac kep."
        ].join(" ");
    }

    private static buildUserPrompt(input: { postText?: string; authorName?: string; }) {
        const postText = String(input.postText || "").trim().slice(0, 700);
        const authorName = String(input.authorName || "").slice(0, 80);
        return [
            authorName ? `Tac gia: ${authorName}` : "",
            `Noi dung bai viet: ${postText}`,
            "Hay tao mot binh luan phu hop bang tieng Viet co dau."
        ].filter(Boolean).join("\n");
    }

    private static extractTextParts(value: any): string[] {
        if (typeof value === "string") {
            return [value];
        }

        if (!value || typeof value !== "object") {
            return [];
        }

        if (Array.isArray(value)) {
            return value.flatMap((item) => this.extractTextParts(item));
        }

        const result: string[] = [];

        if (typeof value.text === "string") {
            result.push(value.text);
        }

        if (typeof value.content === "string") {
            result.push(value.content);
        } else if (Array.isArray(value.content)) {
            result.push(...value.content.flatMap((item: any) => this.extractTextParts(item)));
        }

        return result;
    }

    private static extractTextFromPayload(data: any) {
        const candidates: string[] = [];

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

    private static summarizePayload(source: string, data: any, text: string) {
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

    private static summarizeError(source: string, error: any) {
        return {
            source,
            err: error?.message || String(error),
            status: error?.response?.status,
            data: error?.response?.data
        };
    }

    static async generateComment(input: {
        postText?: string;
        authorName?: string;
    }) {
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
        const attempts: any[] = [];
        let lastError: any = null;

        try {
            const response = await axios.post(
                "https://api.openai.com/v1/responses",
                {
                    model: ENV.OPENAI_COMMENT_MODEL,
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
                },
                {
                    timeout: ENV.OPENAI_COMMENT_TIMEOUT_MS,
                    headers
                }
            );

            const text = this.extractTextFromPayload(response.data);
            attempts.push(this.summarizePayload("responses", response.data, text));
            if (text) {
                this.lastResponseMeta = { attempts };
                return text;
            }
        } catch (error: any) {
            lastError = error;
            attempts.push(this.summarizeError("responses", error));
        }

        try {
            const response = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                    model: ENV.OPENAI_COMMENT_MODEL,
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
                },
                {
                    timeout: ENV.OPENAI_COMMENT_TIMEOUT_MS,
                    headers
                }
            );

            const text = this.extractTextFromPayload(response.data);
            attempts.push(this.summarizePayload("chat.completions", response.data, text));
            this.lastResponseMeta = { attempts };
            if (text) {
                return text;
            }
        } catch (error: any) {
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
