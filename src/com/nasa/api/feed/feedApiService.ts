import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class FeedApiService {
    static async createPost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/create`, ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async updatePost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/update`, ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async deletePost(accessToken: string, postId: string | number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/delete`, ApiClient.buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async hidePost(accessToken: string, postId: string | number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/hide`, ApiClient.buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async repostPost(accessToken: string, id: string | number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/repost`, ApiClient.buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async reportPost(accessToken: string, id: string | number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/posts/report`, ApiClient.buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async getPostDetails(accessToken: string, postId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/posts/${postId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getListFeeling(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/posts/feeling`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getListBackgroundColor(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/posts/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getFeedBackgroundColor(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/feed/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getListCheckinPosition(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/posts/checkin-position`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getFeedByUserId(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/feed/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFeedHome(accessToken: string, headers = buildHeaders(), postId = "", createdAt = Date.now(), limit = 10, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/feed/home`, ApiClient.buildPayload({ postId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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

    static async getFeedProfile(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/feed/profile`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFeedHomeFree(headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/feed/home-free`, {
            headers: { ...headers },
            params: { limit, offset },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
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
