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

export class ReactionApiService {
    static async sendReaction(accessToken: string, postId: string, type: string, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/reaction/send`, buildPayload({ postId: String(postId), reactionTypeCode: type }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }

    static async removeReaction(accessToken: string, postId: string, headers = buildHeaders(), agent?: any) {
        return createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/reaction/remove`, buildPayload({ postId: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }

    static async listReactions(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/reaction/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async listReactionsByPost(accessToken: string, postId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/reaction/list`, buildPayload({ postId, limit, offset }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }
}
