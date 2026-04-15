import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class FriendApiService {
    static async getFollowers(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/follow/followers/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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

    static async getFriendList(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/friend/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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

    static async getMyFriends(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/friend/myFriends`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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

    static async sendFriendRequest(accessToken: string, receiverId: string | number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/friend/requests`, ApiClient.buildPayload({ receiverId: String(receiverId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }

    static async acceptFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/friend/requests/accept`, ApiClient.buildPayload({ senderId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }

    static async getSentRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/friend/requests/sent`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId|postId|commentId|parentId|surfId|entityId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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

    static async deleteFriend(accessToken: string, friendId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).delete(`${ENV.KONG_URL}/api/friend/${friendId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async cancelFriendRequest(accessToken: string, receiverId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).delete(`${ENV.KONG_URL}/api/friend/cancel/${receiverId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async rejectFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).delete(`${ENV.KONG_URL}/api/friend/reject/${senderId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getReceivedRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/friend/requests/received`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    const transformed = data.replace(/"(userId|accountId|id|senderId|receiverId)"\s*:\s*(\d+)/g, '"$1": "$2"');
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
