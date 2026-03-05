import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class MediaApiService {
    static async uploadMedia(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/media/upload`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: agent
        });
    }

    static async uploadMediaSurf(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/media/upload-surf`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: agent
        });
    }

    static async getPresignedUrl(accessToken: string, objectKey: string, headers = buildHeaders(), agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/v1/media/presigned`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { objectKey },
            httpsAgent: agent
        });
    }


    static async getImagesByUser(accessToken: string, userId: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/media/images/by-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset },
            httpsAgent: agent
        });
    }

    static async uploadAvatar(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/media/profile/upload-avatar`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: agent
        });
    }

    static async uploadCover(accessToken: string, formData: FormData, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/media/profile/upload-cover`, formData, {
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: agent
        });
    }
}
