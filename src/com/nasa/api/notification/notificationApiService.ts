import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class NotificationApiService {
    static async listNotifications(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/notification/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async readNotification(accessToken: string, notificationId: string, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/v1/notification/${notificationId}/read`, {}, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
