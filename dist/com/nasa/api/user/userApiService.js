"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserApiService = void 0;
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class UserApiService {
    static async getProfileMe(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        const client = ApiClient_1.ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/me`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            transformResponse: [(data) => {
                    if (typeof data === 'string') {
                        // Prevent large number precision loss by wrapping IDs in quotes
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
    static async getProfileById(accessToken, id, headers = (0, headers_1.buildHeaders)(), agent) {
        const client = ApiClient_1.ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/id/${id}`, {
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
    static async getProfileByUsername(accessToken, username, headers = (0, headers_1.buildHeaders)(), agent) {
        const client = ApiClient_1.ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/username/${username}`, {
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
    static async updateProfile(accessToken, profileData, headers = (0, headers_1.buildHeaders)(), agent) {
        const client = ApiClient_1.ApiClient.createSignedClient(headers, agent);
        return client.post(`/api/user/update-profile`, profileData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }
    static async getListImages(accessToken, userId, limit = 10, offset = 0, headers = (0, headers_1.buildHeaders)(), agent) {
        const client = ApiClient_1.ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/list-images`, {
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
}
exports.UserApiService = UserApiService;
