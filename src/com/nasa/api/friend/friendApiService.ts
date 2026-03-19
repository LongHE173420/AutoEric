import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

export class FriendApiService {

    static async getFollowers(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/follow/followers/${userId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async getFriendList(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            httpsAgent: agent
        });
    }

    static async getMyFriends(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/myFriends`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async searchFriends(accessToken: string, keyword: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { keyword, limit, offset },
            httpsAgent: agent
        });
    }

    static async searchSuggests(accessToken: string, keyword: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search-suggests`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: keyword ? { keyword, limit, offset } : { limit, offset },
            httpsAgent: agent
        });
    }

    static async sendFriendRequest(accessToken: string, receiverId: string | number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests`, buildPayload({ receiverId: String(receiverId) }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async acceptFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests/accept`, buildPayload({ senderId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async getSentRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/sent`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async deleteFriend(accessToken: string, friendId: string, headers = buildHeaders(), agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/${friendId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async cancelFriendRequest(accessToken: string, receiverId: string, headers = buildHeaders(), agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/cancel/${receiverId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async rejectFriendRequest(accessToken: string, senderId: string, headers = buildHeaders(), agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/reject/${senderId}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getReceivedRequests(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/received`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }
}
