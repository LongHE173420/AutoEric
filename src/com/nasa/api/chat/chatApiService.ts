import axios from 'axios';
import { ENV } from '../../config/env';

export class ChatApiService {

    static async createConversation(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/chat/conversation/create`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async listConversations(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/chat/conversation/list`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async listMessages(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/chat/message/list`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
