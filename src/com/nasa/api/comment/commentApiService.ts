import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class CommentApiService {
    static async createComment(accessToken: string, commentData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/comments/create`, ApiClient.buildPayload(commentData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
}
