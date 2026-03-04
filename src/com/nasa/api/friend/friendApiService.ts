import axios from 'axios';
import { ENV } from '../../config/env';

export class FriendApiService {

    static async getFollowers(accessToken: string, userId: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/follow/followers/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async getFriendList(accessToken: string, userId: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/list`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            httpsAgent: agent
        });
    }

    static async getMyFriends(accessToken: string, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/myFriends`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async searchFriends(accessToken: string, keyword: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { keyword, limit, offset },
            httpsAgent: agent
        });
    }

    static async searchSuggests(accessToken: string, keyword: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search-suggests`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { keyword, limit, offset },
            httpsAgent: agent
        });
    }

    static async sendFriendRequest(accessToken: string, receiverId: string, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests`, { receiverId }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async acceptFriendRequest(accessToken: string, senderId: string, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests/accept`, { senderId }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getSentRequests(accessToken: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/sent`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async deleteFriend(accessToken: string, friendId: string, agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/${friendId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async cancelFriendRequest(accessToken: string, receiverId: string, agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/cancel/${receiverId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async rejectFriendRequest(accessToken: string, senderId: string, agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/reject/${senderId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getReceivedRequests(accessToken: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/received`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }
}

