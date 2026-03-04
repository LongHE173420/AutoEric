import axios from 'axios';
import { ENV } from '../../config/env';

export class CommentApiService {

    static async createComment(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/create`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async updateComment(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/update`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async removeComment(accessToken: string, data: any, agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments/remove`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: data,
            httpsAgent: agent
        });
    }

    static async listComments(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/list`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async hideComment(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/hidden`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async unhideComment(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/un-hidden`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async addCommentReaction(accessToken: string, data: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments-reaction/add`, data, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async removeCommentReaction(accessToken: string, data: any, agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments-reaction/remove`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: data,
            httpsAgent: agent
        });
    }
}
