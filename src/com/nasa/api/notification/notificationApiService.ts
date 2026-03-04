import axios from 'axios';
import { ENV } from '../../config/env';

export class NotificationApiService {
    static async listNotifications(accessToken: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.NOTIFICATION_URL}/api/v1/notification/list`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }

    static async readNotification(accessToken: string, notificationId: string, agent?: any) {
        return axios.post(`${ENV.NOTIFICATION_URL}/api/v1/notification/${notificationId}/read`, {}, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
