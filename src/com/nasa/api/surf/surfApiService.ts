import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class SurfApiService {
    static async generateId(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/generate-id`, "", {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async createSurf(accessToken: string, surfData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/create`, ApiClient.buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async completeSurf(accessToken: string, surfData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/complete`, ApiClient.buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async getSurfHome(accessToken: string, headers = buildHeaders(), surfId = "", createdAt = Math.floor(Date.now() / 1000), limit = 4, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/surf/home`, ApiClient.buildPayload({ surfId, createdAt, limit }), {
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
