import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class UserApiService {
            static async getProfileMe(accessToken: string, headers = buildHeaders(), agent?: any) {
        const client = ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/me`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
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
        const client = ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/id/${id}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async getProfileByUsername(accessToken: string, username: string, headers = buildHeaders(), agent?: any) {
        const client = ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/username/${username}`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async updateProfile(accessToken: string, profileData: any, headers = buildHeaders(), agent?: any) {
        const client = ApiClient.createSignedClient(headers, agent);
        return client.post(`/api/user/update-profile`, profileData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
    }

    static async getListImages(accessToken: string, userId: string, limit = 10, offset = 0, headers = buildHeaders(), agent?: any) {
        const client = ApiClient.createSignedClient(headers, agent);
        return client.get(`/api/user/list-images`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
        });
    }

}
