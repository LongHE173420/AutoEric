import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';
import { applyStandardInterceptors } from '../../utils/axiosSignature';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"?(\d+)"?/g, '"$1":"$2"');

const createSignedClient = (headers: any, agent?: any) => {
    const deviceId = headers?.["X-Device-Id"] || headers?.["x-device-id"];
    const client = axios.create({
        httpsAgent: agent
    });
    applyStandardInterceptors(client, String(deviceId || ""));
    return client;
};

export class PostApiService {
    static async createPost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/create`, buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async generateId(accessToken: string, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/generate-id`, "", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async completePost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/complete`, buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
}
