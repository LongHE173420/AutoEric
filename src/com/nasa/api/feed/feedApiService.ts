import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

export class FeedApiService {
    static async createPost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/create`, buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async updatePost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/update`, buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async deletePost(accessToken: string, postId: string | number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/delete`, buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async hidePost(accessToken: string, postId: string | number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/hide`, buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async repostPost(accessToken: string, id: string | number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/repost`, buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async reportPost(accessToken: string, id: string | number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/report`, buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getPostDetails(accessToken: string, postId: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/posts/${postId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getListFeeling(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/posts/feeling`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getListBackgroundColor(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/posts/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getFeedBackgroundColor(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/feed/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getListCheckinPosition(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/posts/checkin-position`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getFeedByUserId(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/feed/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async getFeedHome(accessToken: string, headers = buildHeaders(), postId = "", createdAt = Date.now(), limit = 10, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/feed/home`, buildPayload({ postId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent,
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    // Prevent large number precision loss by wrapping IDs in quotes
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

    static async getFeedProfile(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/feed/profile`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async getFeedHomeFree(headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/feed/home-free`, {
            headers: { ...headers },
            params: { limit, offset },
            httpsAgent: agent,
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    // Prevent large number precision loss by wrapping IDs in quotes
                    const transformed = data.replace(/"(id|postId|commentId|parentId|userId|accountId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
