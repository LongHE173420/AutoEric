"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class FeedApiService {
    static async createPost(accessToken, postData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/create`, ApiClient_1.ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async updatePost(accessToken, postData, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/update`, ApiClient_1.ApiClient.buildPayload(postData), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async deletePost(accessToken, postId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/delete`, ApiClient_1.ApiClient.buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async hidePost(accessToken, postId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/hide`, ApiClient_1.ApiClient.buildPayload({ id: String(postId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async repostPost(accessToken, id, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/repost`, ApiClient_1.ApiClient.buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async reportPost(accessToken, id, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/posts/report`, ApiClient_1.ApiClient.buildPayload({ id: String(id) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async getPostDetails(accessToken, postId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/posts/${postId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getListFeeling(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/posts/feeling`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getListBackgroundColor(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/posts/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getFeedBackgroundColor(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/feed/background-color`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getListCheckinPosition(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/posts/checkin-position`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getFeedByUserId(accessToken, userId, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/feed/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
    static async getFeedHome(accessToken, headers = (0, headers_1.buildHeaders)(), postId = "", createdAt = Date.now(), limit = 10, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/feed/home`, ApiClient_1.ApiClient.buildPayload({ postId, createdAt, limit }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*(\d+)/g, '"$1": "$2"');
                        try {
                            return JSON.parse(transformed);
                        }
                        catch (e) {
                            return data;
                        }
                    }
                    return data;
                }]
        });
    }
    static async getFeedProfile(accessToken, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/feed/profile`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
    static async getFeedHomeFree(headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/feed/home-free`, {
            headers: { ...headers },
            params: { limit, offset },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(id|postId|commentId|parentId|userId|accountId)"\s*:\s*(\d+)/g, '"$1": "$2"');
                        try {
                            return JSON.parse(transformed);
                        }
                        catch (e) {
                            return data;
                        }
                    }
                    return data;
                }]
        });
    }
}
exports.FeedApiService = FeedApiService;
