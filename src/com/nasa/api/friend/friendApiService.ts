import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';
import { applyStandardInterceptors } from '../../utils/axiosSignature';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

export class FriendApiService {

    private static getDeviceId(headers: any) {
        return headers?.["X-Device-Id"] || headers?.["x-device-id"];
    }

    private static getClient(deviceId?: string, agent?: any) {
        const client = axios.create({
            baseURL: ENV.KONG_URL,
            httpsAgent: agent,
            timeout: 10000
        });
        applyStandardInterceptors(client, String(deviceId || ""));
        return client;
    }

    static async getFollowers(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.get(`/api/follow/followers/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFriendList(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.get(`/api/friend/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async getMyFriends(accessToken: string, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.get(`/api/friend/myFriends`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }



    static async sendFriendRequest(accessToken: string, receiverId: string | number, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.post(`/api/friend/requests`, buildPayload({ receiverId: String(receiverId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }

    static async acceptFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.post(`/api/friend/requests/accept`, buildPayload({ senderId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });
    }

    static async getSentRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.get(`/api/friend/requests/sent`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async deleteFriend(accessToken: string, friendId: string, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.delete(`/api/friend/${friendId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async cancelFriendRequest(accessToken: string, receiverId: string, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.delete(`/api/friend/cancel/${receiverId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async rejectFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.delete(`/api/friend/reject/${senderId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getReceivedRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        const client = this.getClient(this.getDeviceId(headers), agent);
        return client.get(`/api/friend/requests/received`, {
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
