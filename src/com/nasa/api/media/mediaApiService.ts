import axios from 'axios';
import FormData from 'form-data';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

const MEDIA_API_BASE_URL = ENV.MEDIA_API_URL || ENV.KONG_URL;

type MediaUploadRequestOptions = {
    preferredBaseUrl?: string;
    allowFallbackBaseUrls?: boolean;
};

function normalizeBaseUrl(value: any): string | undefined {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    return normalized || undefined;
}

function getMediaUploadBaseUrls(preferredBaseUrl?: string): string[] {
    const configuredExtraBaseUrls = String((ENV as any).MEDIA_UPLOAD_API_URLS || "")
        .split(",")
        .map((value) => normalizeBaseUrl(value))
        .filter((value): value is string => Boolean(value));

    const fallbackKongUrl = normalizeBaseUrl(ENV.KONG_URL);

    const candidates = [
        normalizeBaseUrl(preferredBaseUrl),
        fallbackKongUrl,
        normalizeBaseUrl((ENV as any).MEDIA_UPLOAD_API_URL),
        ...configuredExtraBaseUrls,
        normalizeBaseUrl(MEDIA_API_BASE_URL)
    ];

    const seen = new Set<string>();
    const out: string[] = [];

    for (const candidate of candidates) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        out.push(candidate);
    }

    if (out.length > 0) {
        return out;
    }

    return [];
}

function buildMediaUploadUrl(baseUrl: string, pathname: string): string {
    return `${baseUrl}${pathname}`;
}

function shouldRetryMediaUploadOnNextBaseUrl(err: any): boolean {
    const status = Number(err?.response?.status || 0);
    if (!status) return true;
    return [400, 401, 403, 404, 405, 415, 422].includes(status);
}

function attachMediaUploadAttempts(err: any, attempts: Array<Record<string, any>>) {
    const target = err as any;
    target.uploadAttemptUrls = attempts;

    if (target.requestDebug && typeof target.requestDebug === "object") {
        target.requestDebug = {
            ...target.requestDebug,
            uploadAttemptUrls: attempts
        };
    }

    return target;
}

function omitHeadersCaseInsensitive(headers: Record<string, any>, headerNames: string[]): Record<string, any> {
    const omitSet = new Set(headerNames.map((name) => name.toLowerCase()));
    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers || {})) {
        if (omitSet.has(String(key).toLowerCase())) continue;
        out[key] = value;
    }

    return out;
}

function buildJsonUploadHeaders(headers: Record<string, any>, accessToken: string): Record<string, any> {
    const baseHeaders = omitHeadersCaseInsensitive(headers || {}, ["content-type", "content-length"]);

    return {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}

function buildMultipartUploadHeaders(
    headers: Record<string, any>,
    accessToken: string,
    formData: any,
    contentLength?: number
): Record<string, any> {
    const baseHeaders = omitHeadersCaseInsensitive(headers || {}, ["content-type", "content-length"]);

    return {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
        ...(formData.getHeaders ? formData.getHeaders() : { "Content-Type": "multipart/form-data" }),
        ...(contentLength ? { "Content-Length": contentLength } : {})
    };
}

function maskHeaderValue(key: string, value: any): string {
    const raw = Array.isArray(value) ? value.join(", ") : String(value ?? "");

    if (key.toLowerCase() === "authorization") {
        const token = raw.replace(/^Bearer\s+/i, "").trim();
        if (!token) return "";
        if (token.length <= 12) return "Bearer ***";
        return `Bearer ${token.slice(0, 8)}...${token.slice(-6)}`;
    }

    return raw;
}

function sanitizeHeaders(headers: any): Record<string, string> | undefined {
    if (!headers || typeof headers !== "object") return undefined;

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        out[String(key)] = maskHeaderValue(String(key), value);
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

function stringifyForDebug(data: any, maxLength = 2000): string | undefined {
    try {
        if (data === undefined || data === null) return undefined;
        return (typeof data === "string" ? data : JSON.stringify(data)).slice(0, maxLength);
    } catch {
        return undefined;
    }
}

function summarizeFormData(formData: any): Array<Record<string, string>> | undefined {
    const streams = Array.isArray(formData?._streams) ? formData._streams : [];
    const summary: Array<Record<string, string>> = [];

    for (const chunk of streams) {
        if (typeof chunk !== "string") continue;

        const nameMatch = chunk.match(/name="([^"]+)"/i);
        if (!nameMatch) continue;

        const entry: Record<string, string> = { key: nameMatch[1] };
        const fileMatch = chunk.match(/filename="([^"]+)"/i);
        const contentTypeMatch = chunk.match(/content-type:\s*([^\r\n]+)/i);

        if (fileMatch?.[1]) entry.fileName = fileMatch[1];
        if (contentTypeMatch?.[1]) entry.contentType = contentTypeMatch[1];

        summary.push(entry);
    }

    return summary.length > 0 ? summary : undefined;
}

function enrichHttpError(err: any, meta: {
    requestType: string;
    url: string;
    method: string;
    requestHeaders?: any;
    requestBodyPreview?: string;
    formDataSummary?: Array<Record<string, string>>;
    contentLength?: number;
}) {
    const enriched = err as any;
    const responseStatus = enriched?.response?.status;
    const responseStatusText = enriched?.response?.statusText;
    const responseHeaders = sanitizeHeaders(enriched?.response?.headers);
    const backendRaw = stringifyForDebug(enriched?.response?.data);

    enriched.requestHeaders = sanitizeHeaders(meta.requestHeaders);
    enriched.responseHeaders = responseHeaders;
    enriched.requestDebug = {
        requestType: meta.requestType,
        url: meta.url,
        method: meta.method,
        contentLength: meta.contentLength,
        requestHeaders: sanitizeHeaders(meta.requestHeaders),
        requestBodyPreview: meta.requestBodyPreview,
        formDataSummary: meta.formDataSummary,
        signatureDebug: enriched?.config?.__signatureDebug,
        responseStatus,
        responseStatusText,
        responseHeaders,
        backendRaw
    };

    return enriched;
}

export class MediaApiService {
    static async requestUploadUrl(
        accessToken: string,
        payload: any,
        headers = buildHeaders(),
        agent?: any,
        options: MediaUploadRequestOptions = {}
    ) {
        const requestPayload = typeof payload === "string" ? payload : ApiClient.buildPayload(payload);
        const requestHeaders = buildJsonUploadHeaders(headers, accessToken);
        const allowFallbackBaseUrls = options.allowFallbackBaseUrls !== false;
        const baseUrls = getMediaUploadBaseUrls(options.preferredBaseUrl);
        const urlsToTry = allowFallbackBaseUrls ? baseUrls : baseUrls.slice(0, 1);
        const attempts: Array<Record<string, any>> = [];

        for (let index = 0; index < urlsToTry.length; index++) {
            const url = buildMediaUploadUrl(urlsToTry[index], "/api/media/upload");

            try {
                const response = await ApiClient.createSignedClient(requestHeaders, agent).post(url, requestPayload, {
                    headers: requestHeaders,
                });

                (response as any).__mediaUploadRequestUrl = url;
                if (attempts.length > 0) {
                    (response as any).__mediaUploadAttemptUrls = attempts;
                }

                return response;
            } catch (err: any) {
                const enrichedErr = enrichHttpError(err, {
                    requestType: "media-upload-presigned",
                    url,
                    method: "POST",
                    requestHeaders,
                    requestBodyPreview: stringifyForDebug(requestPayload, 3000)
                });

                attempts.push({
                    url,
                    responseStatus: enrichedErr?.response?.status,
                    responseStatusText: enrichedErr?.response?.statusText,
                    backendRaw: stringifyForDebug(enrichedErr?.response?.data, 500)
                });

                if (index >= urlsToTry.length - 1 || !shouldRetryMediaUploadOnNextBaseUrl(enrichedErr)) {
                    throw attachMediaUploadAttempts(enrichedErr, attempts);
                }
            }
        }

        throw new Error("No media upload base URL available");
    }

    static async uploadMediaToS3(
        presignedUrl: string,
        fileStream: any,
        mimeType: string,
        fileName = 'upload.bin',
        fields?: Record<string, any>
    ) {
        const FormData = require('form-data');
        // Use a custom boundary to look more like the real app and avoid potential proxy issues with long dash-prefixed boundaries
        const customBoundary = 'EricSocialUpload' + Date.now().toString(16);
        const formData = new FormData();
        (formData as any)._boundary = customBoundary;

        // S3 Presigned POST requires fields in specific order, ending with 'file'.
        if (fields) {
            for (const [key, value] of Object.entries(fields)) {
                if (value !== undefined && value !== null) {
                    formData.append(key, String(value));
                }
            }
        }

        // Use the EXACT case from the policy for the mimeType part header if possible
        const partMimeType = fields?.['Content-Type'] || mimeType;

        formData.append('file', fileStream, {
            filename: fileName,
            contentType: partMimeType
        });

        // Debug: Capture raw form data (hex) to inspect boundary and file magic bytes
        let bodyPreview: string | undefined;
        try {
            const buffer = formData.getBuffer();
            const fileMarker = buffer.indexOf(Buffer.from('name="file"'));
            if (fileMarker !== -1) {
                const start = Math.max(0, fileMarker - 100);
                bodyPreview = "FILE_PART_PREVIEW: " + buffer.slice(start, start + 1000).toString('hex');
            } else {
                bodyPreview = buffer.slice(0, 1000).toString('hex');
            }
        } catch (e) { }

        const requestHeaders = {
            ...formData.getHeaders(),
            "User-Agent": "EricSocial/89 CFNetwork/3826.500.131 Darwin/24.6.0",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "vi-VN,vi;q=0.9",
            "Accept-Encoding": "gzip, br"
        };

        try {
            // Use a fresh axios instance to avoid global KONG signature interceptors
            // which might add unexpected headers (X-Signature, etc.) that confuse the S3 proxy.
            const cleanAxios = axios.create();
            return await cleanAxios.post(presignedUrl, formData, {
                headers: requestHeaders,
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });
        } catch (err: any) {
            throw enrichHttpError(err, {
                requestType: "media-upload-s3",
                url: presignedUrl,
                method: "POST",
                requestHeaders,
                requestBodyPreview: bodyPreview,
                formDataSummary: summarizeFormData(formData)
            });
        }
    }

    static async uploadMedia(
        accessToken: string,
        formData: any,
        headers = buildHeaders(),
        agent?: any,
        options: MediaUploadRequestOptions & { skipSignature?: boolean } = {}
    ) {
        let contentLength: number | undefined;
        try {
            contentLength = await new Promise<number>((resolve, reject) => {
                formData.getLength((err: any, len: number) => {
                    if (err) reject(err);
                    else resolve(len);
                });
            });
        } catch (e) { }

        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData, contentLength);

        // CLEANUP: Remove internal signals and KONG-specific headers if skipSignature is true
        delete (requestHeaders as any)._preferredBaseUrl;
        delete (requestHeaders as any)._skipSignature;

        if (options.skipSignature) {
            // Real app logs show ONLY these headers for the direct S3/Proxy upload
            const nakedHeaders: any = {
                "User-Agent": requestHeaders["User-Agent"] || "EricSocial/89 CFNetwork/3826.500.131 Darwin/24.6.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "vi-VN,vi;q=0.9",
                "Accept-Encoding": "gzip, br"
            };
            if (accessToken) {
                nakedHeaders["Authorization"] = `Bearer ${accessToken}`;
            }
            if (requestHeaders["content-type"]) {
                nakedHeaders["content-type"] = requestHeaders["content-type"];
            }
            // Replace requestHeaders with naked set
            Object.keys(requestHeaders).forEach(key => delete (requestHeaders as any)[key]);
            Object.assign(requestHeaders, nakedHeaders);
        }

        const allowFallbackBaseUrls = options.allowFallbackBaseUrls !== false;
        const baseUrls = getMediaUploadBaseUrls(options.preferredBaseUrl);
        // Multipart form bodies are not safe to replay across hosts after a failed send.
        const urlsToTry = allowFallbackBaseUrls ? baseUrls : baseUrls.slice(0, 1);
        const attempts: Array<Record<string, any>> = [];

        for (let index = 0; index < urlsToTry.length; index++) {
            const url = buildMediaUploadUrl(urlsToTry[index], "/api/media/upload");

            try {
                // If skipSignature is requested, use a fresh axios instance to avoid KONG interceptors
                const apiClient = options.skipSignature
                    ? axios.create()
                    : ApiClient.createSignedClient(requestHeaders, agent);

                const response = await apiClient.post(url, formData, {
                    headers: requestHeaders,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });

                (response as any).__mediaUploadRequestUrl = url;
                if (attempts.length > 0) {
                    (response as any).__mediaUploadAttemptUrls = attempts;
                }

                return response;
            } catch (err: any) {
                const enrichedErr = enrichHttpError(err, {
                    requestType: options.skipSignature ? "media-upload-direct-unsigned" : "media-upload-direct",
                    url,
                    method: "POST",
                    requestHeaders,
                    contentLength,
                    formDataSummary: summarizeFormData(formData)
                });

                attempts.push({
                    url,
                    responseStatus: enrichedErr?.response?.status,
                    responseStatusText: enrichedErr?.response?.statusText,
                    backendRaw: stringifyForDebug(enrichedErr?.response?.data, 500)
                });

                if (index >= urlsToTry.length - 1 || !shouldRetryMediaUploadOnNextBaseUrl(enrichedErr)) {
                    throw attachMediaUploadAttempts(enrichedErr, attempts);
                }
            }
        }

        throw new Error("No media upload base URL available");
    }

    static async uploadMediaSurf(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        let contentLength: number | undefined;
        try {
            contentLength = await new Promise<number>((resolve, reject) => {
                formData.getLength((err: any, len: number) => {
                    if (err) reject(err);
                    else resolve(len);
                });
            });
        } catch (e) { }

        const surfHeaders = buildMultipartUploadHeaders(headers, accessToken, formData, contentLength);

        return ApiClient.createSignedClient(surfHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/upload-surf`, formData, {
            headers: {
                ...surfHeaders
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
    }

    static async getPresignedUrl(accessToken: string, objectKey: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${MEDIA_API_BASE_URL}/api/media/presigned`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { objectKey }
        });
    }


    static async getImagesByUser(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${MEDIA_API_BASE_URL}/api/media/images/by-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async uploadAvatar(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData);

        return ApiClient.createSignedClient(requestHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/profile/upload-avatar`, formData, {
            headers: {
                ...requestHeaders
            }
        });
    }

    static async uploadCover(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData);

        return ApiClient.createSignedClient(requestHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/profile/upload-cover`, formData, {
            headers: {
                ...requestHeaders
            }
        });
    }
}
