import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class UserApiService {
    static async getProfileMe(accessToken: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/user/me`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent,
            transformResponse: [(data) => {
                if (typeof data === 'string') {
                    // Prevent large number precision loss by wrapping IDs in quotes
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

}
