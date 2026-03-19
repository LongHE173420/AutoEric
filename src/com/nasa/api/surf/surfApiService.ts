import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

export class SurfApiService {
    static async createSurf(accessToken: string, surfData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/create`, buildPayload(surfData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getSurfHome(accessToken: string, headers = buildHeaders(), surfId = "", createdAt = Math.floor(Date.now() / 1000), limit = 4, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/home`, buildPayload({ surfId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent,
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
