import axios from 'axios';
import { ENV } from '../../config/env';

export class UserApiService {
    static async getProfileMe(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/user/me`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getProfileById(accessToken: string, id: string) {
        return axios.get(`${ENV.KONG_URL}/api/v1/user/id/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getProfileByUsername(accessToken: string, username: string) {
        return axios.get(`${ENV.KONG_URL}/api/user/username/${username}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async updateProfile(accessToken: string, profileData: any) {
        return axios.post(`${ENV.KONG_URL}/api/user/update-profile`, profileData, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getListImages(accessToken: string, userId: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/user/list-images`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async searchUsers(accessToken: string, keyword: string, hometown?: string, education?: string, workplace?: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/user/search`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { keyword, hometown, education, workplace, limit, offset }
        });
    }
}
