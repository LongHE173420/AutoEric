"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FriendApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class FriendApiService {
    static async getFollowers(accessToken, userId, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/follow/followers/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
    static async getFriendList(accessToken, userId, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/friend/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
    static async getMyFriends(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/friend/myFriends`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
    static async sendFriendRequest(accessToken, receiverId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/friend/requests`, ApiClient_1.ApiClient.buildPayload({ receiverId: String(receiverId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
    static async acceptFriendRequest(accessToken, senderId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/friend/requests/accept`, ApiClient_1.ApiClient.buildPayload({ senderId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }
    static async getSentRequests(accessToken, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/friend/requests/sent`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
    static async deleteFriend(accessToken, friendId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).delete(`${env_1.ENV.KONG_URL}/api/friend/${friendId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async cancelFriendRequest(accessToken, receiverId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).delete(`${env_1.ENV.KONG_URL}/api/friend/cancel/${receiverId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async rejectFriendRequest(accessToken, senderId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).delete(`${env_1.ENV.KONG_URL}/api/friend/reject/${senderId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async getReceivedRequests(accessToken, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/friend/requests/received`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
exports.FriendApiService = FriendApiService;
