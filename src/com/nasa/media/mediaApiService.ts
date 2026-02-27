import axios from 'axios';
import { ENV } from '../config/env';

export class MediaApiService {
    static async uploadMedia(accessToken: string, formData: FormData) {
        return axios.post(`${ENV.KONG_URL}/api/media/upload`, formData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    static async uploadMediaSurf(accessToken: string, formData: FormData) {
        return axios.post(`${ENV.KONG_URL}/api/v1/media/upload-surf`, formData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    static async getPresignedUrl(accessToken: string, objectKey: string) {
        return axios.get(`${ENV.KONG_URL}/api/v1/media/presigned`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { objectKey }
        });
    }


    static async getImagesByUser(accessToken: string, userId: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/media/images/by-user`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { userId, limit, offset }
        });
    }

    static async uploadAvatar(accessToken: string, formData: FormData) {
        return axios.post(`${ENV.KONG_URL}/api/media/profile/upload-avatar`, formData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }

    static async uploadCover(accessToken: string, formData: FormData) {
        return axios.post(`${ENV.KONG_URL}/api/media/profile/upload-cover`, formData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data'
            }
        });
    }
}
