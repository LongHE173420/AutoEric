import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class UserApiService {
    static async getProfileMe(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/me`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getProfileById(accessToken: string, id: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/id/${id}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getProfileByUsername(accessToken: string, username: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/username/${username}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async updateProfile(accessToken: string, profileData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/user/update-profile`, profileData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getListImages(accessToken: string, userId: string, limit = 10, offset = 0, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/list-images`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            httpsAgent: agent
        });
    }

    static async searchUsers(accessToken: string, keyword: string, hometown?: string, education?: string, workplace?: string, limit = 10, offset = 0, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/search`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { keyword, hometown, education, workplace, limit, offset },
            httpsAgent: agent
        });
    }
}
