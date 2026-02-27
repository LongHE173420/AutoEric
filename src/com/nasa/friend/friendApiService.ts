import axios from 'axios';
import { ENV } from '../config/env';

export class FriendApiService {

    static async getFollowers(accessToken: string, userId: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/follow/followers/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFriendList(accessToken: string, userId: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/friend/list`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async getMyFriends(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/friend/myFriends`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async searchFriends(accessToken: string, keyword: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { keyword, limit, offset }
        });
    }

    static async searchSuggests(accessToken: string, keyword: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/friend/search-suggests`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { keyword, limit, offset }
        });
    }

    static async sendFriendRequest(accessToken: string, receiverId: string) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests`, { receiverId }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async acceptFriendRequest(accessToken: string, senderId: string) {
        return axios.post(`${ENV.KONG_URL}/api/friend/requests/accept`, { senderId }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getSentRequests(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/sent`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async deleteFriend(accessToken: string, friendId: string) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/${friendId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async cancelFriendRequest(accessToken: string, receiverId: string) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/cancel/${receiverId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async rejectFriendRequest(accessToken: string, senderId: string) {
        return axios.delete(`${ENV.KONG_URL}/api/friend/reject/${senderId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getReceivedRequests(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/friend/requests/received`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
}

