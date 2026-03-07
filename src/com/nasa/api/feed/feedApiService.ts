import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class FeedApiService {
    static async createPost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/create`, postData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async updatePost(accessToken: string, postData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/update`, postData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async deletePost(accessToken: string, postId: number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/delete`, { id: postId }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async hidePost(accessToken: string, postId: number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/posts/hide`, { id: postId }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async repostPost(accessToken: string, id: number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/repost`, { id }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async reportPost(accessToken: string, id: number, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/report`, { id }, {
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
        return axios.get(`${ENV.KONG_URL}/api/v1/posts/feeling`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getListBackgroundColor(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/v1/posts/background-color`, {
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
        return axios.get(`${ENV.KONG_URL}/api/v1/posts/checkin-position`, {
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
        return axios.post(`${ENV.KONG_URL}/api/feed/home`, { postId, createdAt, limit }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
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
        return axios.get(`${ENV.KONG_URL}/api/v1/feed/home-free`, {
            headers: { ...headers },
            params: { limit, offset },
            httpsAgent: agent
        });
    }
}
