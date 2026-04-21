import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

const POST_API_BASE_URL = ENV.POST_API_URL || ENV.KONG_URL;

export class PostApiService {
    static async createPost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/create`, ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async generateId(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/generate-id`, "", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async completePost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${POST_API_BASE_URL}/api/posts/complete`, ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
}
