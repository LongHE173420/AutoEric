import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';
import { applyStandardInterceptors } from '../../utils/axiosSignature';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

const createSignedClient = (headers: any, agent?: any) => {
    const deviceId = headers?.["X-Device-Id"] || headers?.["x-device-id"];
    const client = axios.create({
        httpsAgent: agent
    });
    applyStandardInterceptors(client, String(deviceId || ""));
    return client;
};

export class SurfApiService {
    static async createSurf(accessToken: string, surfData: any, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/create`, buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async getSurfHome(accessToken: string, headers = buildHeaders(), surfId = "", createdAt = Math.floor(Date.now() / 1000), limit = 4, agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/home`, buildPayload({ surfId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*(\d+)/g, '"$1": "$2"');
                    try {
                        return JSON.parse(transformed);
                    } catch (e) {
                        return data;
                    }
                }
                return data;
            }]
        });
    }
}
