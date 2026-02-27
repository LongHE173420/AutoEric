import axios from 'axios';
import { ENV } from '../config/env';

export class FeedApiService {
    static async createPost(accessToken: string, postData: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/create`, postData, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async updatePost(accessToken: string, postData: any) {
        return axios.post(`${ENV.KONG_URL}/api/posts/update`, postData, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async deletePost(accessToken: string, id: number) {
        return axios.post(`${ENV.BASE_URL}/api/v1/posts/delete`, { id }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async hidePost(accessToken: string, id: number) {
        return axios.post(`${ENV.BASE_URL}/api/v1/posts/hide`, { id }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async repostPost(accessToken: string, id: number) {
        return axios.post(`${ENV.KONG_URL}/api/posts/repost`, { id }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async reportPost(accessToken: string, id: number) {
        return axios.post(`${ENV.KONG_URL}/api/posts/report`, { id }, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async getPostDetails(accessToken: string, postId: string) {
        return axios.get(`${ENV.KONG_URL}/api/posts/${postId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async getListFeeling(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/posts/feeling`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async getListBackgroundColor(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/posts/background-color`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async getListCheckinPosition(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/posts/checkin-position`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    static async getFeedByUserId(accessToken: string, userId: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/feed/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFeedHome(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/feed/home`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFeedProfile(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/feed/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async getFeedHomeFree(limit = 10, offset = 0) {
        return axios.get(`${ENV.BASE_URL}/api/v1/feed/home-free`, {
            params: { limit, offset }
        });
    }
}
