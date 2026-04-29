"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaApiService = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
const MEDIA_API_BASE_URL = env_1.ENV.MEDIA_API_URL;
function normalizeBaseUrl(value) {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    return normalized || undefined;
}
function getMediaUploadBaseUrls(preferredBaseUrl) {
    const configuredExtraBaseUrls = String(env_1.ENV.MEDIA_UPLOAD_API_URLS || "")
        .split(",")
        .map((value) => normalizeBaseUrl(value))
        .filter((value) => Boolean(value));
    const fallbackKongUrl = normalizeBaseUrl(env_1.ENV.KONG_URL);
    const candidates = [
        normalizeBaseUrl(preferredBaseUrl),
        fallbackKongUrl,
        ...configuredExtraBaseUrls,
        normalizeBaseUrl(MEDIA_API_BASE_URL)
    ];
    const seen = new Set();
    const out = [];
    for (const candidate of candidates) {
        if (!candidate || seen.has(candidate))
            continue;
        seen.add(candidate);
        out.push(candidate);
    }
    if (out.length > 0) {
        return out;
    }
    return [];
}
function buildMediaUploadUrl(baseUrl, pathname) {
    return `${baseUrl}${pathname}`;
}
function shouldRetryMediaUploadOnNextBaseUrl(err) {
    const status = Number(err?.response?.status || 0);
    if (!status)
        return true;
    return [400, 401, 403, 404, 405, 415, 422].includes(status);
}
function attachMediaUploadAttempts(err, attempts) {
    const target = err;
    target.uploadAttemptUrls = attempts;
    if (target.requestDebug && typeof target.requestDebug === "object") {
        target.requestDebug = {
            ...target.requestDebug,
            uploadAttemptUrls: attempts
        };
    }
    return target;
}
function omitHeadersCaseInsensitive(headers, headerNames) {
    const omitSet = new Set(headerNames.map((name) => name.toLowerCase()));
    const out = {};
    for (const [key, value] of Object.entries(headers || {})) {
        if (omitSet.has(String(key).toLowerCase()))
            continue;
        out[key] = value;
    }
    return out;
}
function buildJsonUploadHeaders(headers, accessToken) {
    const baseHeaders = omitHeadersCaseInsensitive(headers || {}, ["content-type", "content-length"]);
    return {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}
function buildMultipartUploadHeaders(headers, accessToken, formData, contentLength) {
    const baseHeaders = omitHeadersCaseInsensitive(headers || {}, ["content-type", "content-length"]);
    return {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
        ...(formData.getHeaders ? formData.getHeaders() : { "Content-Type": "multipart/form-data" }),
        ...(contentLength ? { "Content-Length": contentLength } : {})
    };
}
function maskHeaderValue(key, value) {
    const raw = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    if (key.toLowerCase() === "authorization") {
        const token = raw.replace(/^Bearer\s+/i, "").trim();
        if (!token)
            return "";
        if (token.length <= 12)
            return "Bearer ***";
        return `Bearer ${token.slice(0, 8)}...${token.slice(-6)}`;
    }
    return raw;
}
function sanitizeHeaders(headers) {
    if (!headers || typeof headers !== "object")
        return undefined;
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null)
            continue;
        out[String(key)] = maskHeaderValue(String(key), value);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function stringifyForDebug(data, maxLength = 2000) {
    try {
        if (data === undefined || data === null)
            return undefined;
        return (typeof data === "string" ? data : JSON.stringify(data)).slice(0, maxLength);
    }
    catch {
        return undefined;
    }
}
function summarizeFormData(formData) {
    const streams = Array.isArray(formData?._streams) ? formData._streams : [];
    const summary = [];
    for (const chunk of streams) {
        if (typeof chunk !== "string")
            continue;
        const nameMatch = chunk.match(/name="([^"]+)"/i);
        if (!nameMatch)
            continue;
        const entry = { key: nameMatch[1] };
        const fileMatch = chunk.match(/filename="([^"]+)"/i);
        const contentTypeMatch = chunk.match(/content-type:\s*([^\r\n]+)/i);
        if (fileMatch?.[1])
            entry.fileName = fileMatch[1];
        if (contentTypeMatch?.[1])
            entry.contentType = contentTypeMatch[1];
        summary.push(entry);
    }
    return summary.length > 0 ? summary : undefined;
}
function enrichHttpError(err, meta) {
    const enriched = err;
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
class MediaApiService {
    static async requestUploadUrl(accessToken, payload, headers = (0, headers_1.buildHeaders)(), agent, options = {}) {
        const requestPayload = typeof payload === "string" ? payload : ApiClient_1.ApiClient.buildPayload(payload);
        const requestHeaders = buildJsonUploadHeaders(headers, accessToken);
        const allowFallbackBaseUrls = options.allowFallbackBaseUrls !== false;
        const baseUrls = getMediaUploadBaseUrls(options.preferredBaseUrl);
        const urlsToTry = allowFallbackBaseUrls ? baseUrls : baseUrls.slice(0, 1);
        const attempts = [];
        for (let index = 0; index < urlsToTry.length; index++) {
            const url = buildMediaUploadUrl(urlsToTry[index], "/api/media/upload");
            try {
                const response = await ApiClient_1.ApiClient.createSignedClient(requestHeaders, agent).post(url, requestPayload, {
                    headers: requestHeaders,
                });
                response.__mediaUploadRequestUrl = url;
                if (attempts.length > 0) {
                    response.__mediaUploadAttemptUrls = attempts;
                }
                return response;
            }
            catch (err) {
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
    static async uploadMediaToS3(presignedUrl, fileStream, mimeType, fileName = 'upload.bin', fields) {
        const FormData = require('form-data');
        // Use a custom boundary to look more like the real app and avoid potential proxy issues with long dash-prefixed boundaries
        const customBoundary = 'EricSocialUpload' + Date.now().toString(16);
        const formData = new FormData();
        formData._boundary = customBoundary;
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
        let bodyPreview;
        try {
            const buffer = formData.getBuffer();
            const fileMarker = buffer.indexOf(Buffer.from('name="file"'));
            if (fileMarker !== -1) {
                const start = Math.max(0, fileMarker - 100);
                bodyPreview = "FILE_PART_PREVIEW: " + buffer.slice(start, start + 1000).toString('hex');
            }
            else {
                bodyPreview = buffer.slice(0, 1000).toString('hex');
            }
        }
        catch (e) { }
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
            const cleanAxios = axios_1.default.create();
            return await cleanAxios.post(presignedUrl, formData, {
                headers: requestHeaders,
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });
        }
        catch (err) {
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
    static async uploadMedia(accessToken, formData, headers = (0, headers_1.buildHeaders)(), agent, options = {}) {
        let contentLength;
        try {
            contentLength = await new Promise((resolve, reject) => {
                formData.getLength((err, len) => {
                    if (err)
                        reject(err);
                    else
                        resolve(len);
                });
            });
        }
        catch (e) { }
        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData, contentLength);
        // CLEANUP: Remove internal signals and KONG-specific headers if skipSignature is true
        delete requestHeaders._preferredBaseUrl;
        delete requestHeaders._skipSignature;
        if (options.skipSignature) {
            // Real app logs show ONLY these headers for the direct S3/Proxy upload
            const nakedHeaders = {
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
            Object.keys(requestHeaders).forEach(key => delete requestHeaders[key]);
            Object.assign(requestHeaders, nakedHeaders);
        }
        const allowFallbackBaseUrls = options.allowFallbackBaseUrls !== false;
        const baseUrls = getMediaUploadBaseUrls(options.preferredBaseUrl);
        // Multipart form bodies are not safe to replay across hosts after a failed send.
        const urlsToTry = allowFallbackBaseUrls ? baseUrls : baseUrls.slice(0, 1);
        const attempts = [];
        for (let index = 0; index < urlsToTry.length; index++) {
            const url = buildMediaUploadUrl(urlsToTry[index], "/api/media/upload");
            try {
                // If skipSignature is requested, use a fresh axios instance to avoid KONG interceptors
                const apiClient = options.skipSignature
                    ? axios_1.default.create()
                    : ApiClient_1.ApiClient.createSignedClient(requestHeaders, agent);
                const response = await apiClient.post(url, formData, {
                    headers: requestHeaders,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });
                response.__mediaUploadRequestUrl = url;
                if (attempts.length > 0) {
                    response.__mediaUploadAttemptUrls = attempts;
                }
                return response;
            }
            catch (err) {
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
    static async uploadMediaSurf(accessToken, formData, headers = (0, headers_1.buildHeaders)(), agent) {
        let contentLength;
        try {
            contentLength = await new Promise((resolve, reject) => {
                formData.getLength((err, len) => {
                    if (err)
                        reject(err);
                    else
                        resolve(len);
                });
            });
        }
        catch (e) { }
        const surfHeaders = buildMultipartUploadHeaders(headers, accessToken, formData, contentLength);
        return ApiClient_1.ApiClient.createSignedClient(surfHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/upload-surf`, formData, {
            headers: {
                ...surfHeaders
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
    }
    static async getPresignedUrl(accessToken, objectKey, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${MEDIA_API_BASE_URL}/api/media/presigned`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { objectKey }
        });
    }
    static async getImagesByUser(accessToken, userId, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${MEDIA_API_BASE_URL}/api/media/images/by-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }
    static async uploadAvatar(accessToken, formData, headers = (0, headers_1.buildHeaders)(), agent) {
        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData);
        return ApiClient_1.ApiClient.createSignedClient(requestHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/profile/upload-avatar`, formData, {
            headers: {
                ...requestHeaders
            }
        });
    }
    static async uploadCover(accessToken, formData, headers = (0, headers_1.buildHeaders)(), agent) {
        const requestHeaders = buildMultipartUploadHeaders(headers, accessToken, formData);
        return ApiClient_1.ApiClient.createSignedClient(requestHeaders, agent).post(`${MEDIA_API_BASE_URL}/api/media/profile/upload-cover`, formData, {
            headers: {
                ...requestHeaders
            }
        });
    }
}
exports.MediaApiService = MediaApiService;
