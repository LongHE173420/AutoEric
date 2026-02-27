import axios from 'axios';
import { ENV } from '../config/env';

export class CommentApiService {

    static async createComment(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/create`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async updateComment(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/update`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async removeComment(accessToken: string, data: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments/remove`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: data
        });
    }

    static async listComments(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/list`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async hideComment(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/hidden`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async unhideComment(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/un-hidden`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async addCommentReaction(accessToken: string, data: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments-reaction/add`, data, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async removeCommentReaction(accessToken: string, data: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments-reaction/remove`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: data
        });
    }
}
