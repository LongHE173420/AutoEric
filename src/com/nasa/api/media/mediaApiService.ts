import axios from 'axios';
import FormData from 'form-data';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';
import { applyStandardInterceptors } from '../../utils/axiosSignature';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId|entityId)"\s*:\s*"?(\d+)"?/g, '"$1":"$2"');

const createSignedClient = (headers: any, agent?: any) => {
    const deviceId = headers?.["X-Device-Id"] || headers?.["x-device-id"];
    const client = axios.create({
        httpsAgent: agent
    });
    applyStandardInterceptors(client, String(deviceId || ""));
    return client;
};

export class MediaApiService {
    static async requestUploadUrl(accessToken: string, payload: any, headers = buildHeaders(), agent?: any) {
        // Use buildPayload to ensure entityId etc. are stringified correctly to avoid signature/validation 403s
        const strPayload = typeof payload === 'string' ? payload : buildPayload(payload);
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/media/upload`, strPayload, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
    }

    static async uploadMediaToS3(
        presignedUrl: string,
        fileStream: any,
        mimeType: string,
        fileName = 'upload.bin',
        fields?: Record<string, any>
    ) {
        const form = new FormData();

        for (const [key, value] of Object.entries(fields || {})) {
            if (value !== undefined && value !== null) {
                form.append(key, String(value));
            }
        }

        form.append('file', fileStream, {
            filename: fileName,
            contentType: mimeType
        });

        try {
            const response = await axios.post(presignedUrl, form, {
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                headers: form.getHeaders()
            });
            return { ...response, uploadAttempt: 'post-multipart-file' };
        } catch (err: any) {
            err.uploadAttempt = 'post-multipart-file';
            throw err;
        }
    }

    static async uploadMedia(accessToken: string, formData: any, headers = buildHeaders(), agent?: any) {
        let contentLength;
        try {
            contentLength = await new Promise((resolve, reject) => {
                formData.getLength((err: any, len: number) => {
                    if (err) reject(err);
                    else resolve(len);
                });
            });
        } catch (e) {}

        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/media/upload`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                ...(formData.getHeaders ? formData.getHeaders() : { 'Content-Type': 'multipart/form-data' }),
                ...(contentLength ? { 'Content-Length': contentLength } : {})
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
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
        } catch (e) {}

        const surfHeaders = { ...headers, "X-Client-Type": "web" };

        return createSignedClient(surfHeaders, agent).post(`${ENV.KONG_URL}/api/media/upload-surf`, formData, {
            headers: {
                ...surfHeaders,
                Authorization: `Bearer ${accessToken}`,
                ...(formData.getHeaders ? formData.getHeaders() : { 'Content-Type': 'multipart/form-data' }),
                ...(contentLength ? { 'Content-Length': contentLength } : {})
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
    }

    static async getPresignedUrl(accessToken: string, objectKey: string, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/media/presigned`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { objectKey }
        });
    }


    static async getImagesByUser(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/media/images/by-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async uploadAvatar(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/media/profile/upload-avatar`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    static async uploadCover(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/media/profile/upload-cover`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }
}
