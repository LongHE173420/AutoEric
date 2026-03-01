import axios from 'axios';
import { ENV } from '../../config/env';

export class ReactionApiService {
    static async sendReaction(accessToken: string, postId: string, type: string) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/reaction/send`, { postId, type }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async removeReaction(accessToken: string, postId: string) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/reaction/remove`, { postId }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async listReactions(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/reaction/list`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async listReactionsByPost(accessToken: string, postId: string, limit = 10, offset = 0) {
        return axios.post(`${ENV.KONG_URL}/api/posts/reaction/list`, { postId, limit, offset }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }
}
