import axios from "axios";
import { ENV } from "../../config/env";

export class OpenAiCommentService {
    private static lastResponseMeta: any = null;
    private static readonly maxCommentChars = 90;
    private static readonly genericCommentPatterns = [
        /^hay qua[.!?]*$/i,
        /^tuyet voi[.!?]*$/i,
        /^bai viet hay qua[.!?]*$/i,
        /^cam on ban da chia se[.!?]*$/i,
        /^rat y nghia[.!?]*$/i,
        /^that thu vi[.!?]*$/i,
        /^qua tuyet voi[.!?]*$/i,
        /^noi dung rat hay[.!?]*$/i
    ];

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

    private static truncateComment(value: string) {
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

    private static sanitizeComment(value: string) {
        const cleaned = String(value || "")
            .replace(/[\r\n]+/g, " ")
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();

        return this.truncateComment(cleaned);
    }

    private static normalizeVietnamese(value: string) {
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

    private static isGenericComment(value: string) {
        const normalized = this.normalizeVietnamese(value);
        if (!normalized) return true;

        return this.genericCommentPatterns.some((pattern) => pattern.test(normalized));
    }

    private static acceptGeneratedComment(value: string) {
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

    private static buildSystemPrompt() {
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

    private static buildUserPrompt(input: { postText?: string; authorName?: string; }) {
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
            const normalized = this.acceptGeneratedComment(candidate);
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
