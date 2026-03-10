import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class ReactionApiService {
    static async sendReaction(accessToken: string, postId: string, type: string, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/reaction/send`, { postId, type }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async removeReaction(accessToken: string, postId: string, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/reaction/remove`, { postId }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
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
        return axios.post(`${ENV.KONG_URL}/api/posts/reaction/list`, { postId, limit, offset }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
