import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class ReactionApiService {
    static async sendReaction(accessToken: string, postId: string, type: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/reaction/send`, ApiClient.buildPayload({ postId: String(postId), reactionTypeCode: type }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }

    static async removeReaction(accessToken: string, postId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/reaction/remove`, ApiClient.buildPayload({ postId: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
    }

    static async listReactions(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/reaction/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async listReactionsByPost(accessToken: string, postId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/reaction/list`, ApiClient.buildPayload({ postId, limit, offset }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
}
